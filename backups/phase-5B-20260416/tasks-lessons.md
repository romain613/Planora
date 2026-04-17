# LESSONS LEARNED — Calendar360

## 2026-04-16 STEP 5 Phase 5A DATA-DRIFT | Commits lances depuis Mac ecrivent dans une CT locale invisible de la prod
Symptome : apres correction des 2 bugs code (schema boot + res.status), les endpoints `/api/tenant-admin/*` repondent proprement mais `/api/tenant-admin/mode/c1776169036725` renvoie `TENANT_NOT_FOUND` — la company n'existe pas dans `CT.companies` prod, et `CT.tenant_databases` est vide. Pourtant les dry-runs + commits precedents sur Mac affichaient `ok: true`, `Control tower registered`.
Cause racine : `server/db/controlTower.js:13` resout `CT_PATH` via `process.env.CONTROL_TOWER_PATH || '/var/www/planora-data/control_tower.db'`. Sur Mac sans env var + sans ce chemin existant, SQLite cree une CT a la volee au chemin par defaut s'il est writable, sinon throw. Dans les tests, `CONTROL_TOWER_PATH=/tmp/ct-*.db` etait explicitement exporte. En revanche dans les commits "pour de vrai" lances depuis Mac, on avait possiblement une CT locale construite au mauvais endroit, ou pire : succes silencieux sur une CT ephemere. Dans tous les cas : **zero effet sur la CT prod du VPS**. Resultat : 2 commits "successful" ont produit des artefacts fantomes cote Mac, la prod est restee vierge de tout row `companies` + `tenant_databases` pour ces ids.
Fix applique : procedure ecrite — **tout commit destine a la prod est execute depuis le VPS**, pas depuis Mac. Mac = dry-runs + tests avec `CONTROL_TOWER_PATH=/tmp/ct-*.db` explicitement. Le safe pattern : `ssh root@VPS && cd /var/www/planora && node server/scripts/migratePilotTenant.js <id> --commit`. Aucune env var a exporter, tous les chemins par defaut pointent sur la prod.
**Regle** : Pour toute operation qui ecrit dans une DB partagee de production (control tower, registre global, seed dataset), **le seul endroit legitime d'execution est le host de prod lui-meme**. Un script CLI qui lit `process.env.FOO || '/path/prod'` est ambigu par design : il reussit des deux cotes avec des effets differents. Soit on force un echec explicite si l'env var n'est pas set ET qu'on n'est pas sur le host cible (`hostname` check + fail-fast), soit on documente sans ambiguite "COMMIT = VPS uniquement". La lecon plus large : une commande qui affiche "ok: true" n'est pas une preuve que l'effet est au bon endroit. Toujours verifier PAR APRES avec une requete sur la source de verite du systeme cible (`SELECT ... FROM companies WHERE id=?` sur la CT prod), pas uniquement sur le stdout du script.

## 2026-04-16 STEP 5 Phase 5A BUGFIX | Schema CT jamais rejoue au boot + anti-pattern `res.status(e.code)` qui fuit 'SQLITE_ERROR'
Symptomes prod apres deploy Phase 5A :
- `GET /api/tenant-admin/shadow-diffs` → `{"error":"SHADOW_DIFFS_READ_FAILED","detail":"no such table: tenant_shadow_diffs"}`
- `GET /api/tenant-admin/mode/:id` → `{"error":"Invalid status code: SQLITE_ERROR"}`
Cause racine #1 : `initControlTowerSchema()` etait appele dans les scripts CLI (`migratePilotTenant.js`) et dans les tests, mais **JAMAIS dans `server/index.js`** au boot du monolithe. `pm2 restart calendar360` chargeait le nouveau code mais ne rejouait pas le CREATE TABLE + ALTER de Phase 5A → la CT en prod restait sur son schema v4 (sans `tenant_shadow_diffs` ni `companies.tenantFeatures`). Le code pointait vers une table inexistante.
Cause racine #2 : handler `/mode/:companyId` faisait `const code = e.code || 500; res.status(code).json(...)`. `better-sqlite3` throw une `Error` dont `.code = 'SQLITE_ERROR'` (string), pas un entier HTTP. Express rejette avec `RangeError: Invalid status code: SQLITE_ERROR` avant meme d'envoyer le JSON, et ce RangeError ressortait ensuite filtre par un error middleware generique en tant que `{"error":"Invalid status code: SQLITE_ERROR"}`.
Fix applique :
1. **`server/index.js`** : ajout d'un import + appel `initControlTowerSchema()` juste apres `import './db/database.js'`, avant le mount des routes. Wrap try/catch : si le schema init fail, on log en rouge mais on ne tue pas le process (le monolithe reste up, la CT est un composant degradable).
2. **`server/routes/tenantAdmin.js`** : helper `sendError(res, e, fallbackError)` qui (a) convertit `typeof e.code === 'string'` en `sqlCode` (body), (b) n'accepte en HTTP status que `typeof e.code === 'number' && 100..599`, (c) fallback 500 sinon, (d) retourne toujours un JSON `{error, detail, sqlCode}`. Les 3 handlers (`/shadow-diffs`, `/shadow-diffs/summary`, `/mode/:companyId`) utilisent ce helper uniforme. Grep confirme : aucune autre occurrence de `res.status(e.code)` dans `server/**` = pas d'autre bombe.
**Regle** : (a) Tout schema de DB partagee (control tower, shared config, etc.) DOIT etre initialise au boot du serveur, pas seulement dans les CLI/tests. Sinon toute nouvelle table/colonne introduite entre deux deploys est absente en prod tant qu'un CLI particulier n'a pas ete rejoue — bug invisible en dev/test. Test anti-regression : faire tourner le serveur avec une CT effacee et verifier que les endpoints qui en dependent fonctionnent apres boot, sans intervention CLI. (b) `res.status(x)` exige **toujours** un entier HTTP 100..599. Les codes d'erreur de DB (`e.code='SQLITE_ERROR'`, `e.code='ENOENT'`, etc.) sont des strings — les interdire en status via un helper centralise et les exposer dans le body seulement. Pattern a appliquer partout : `res.status(httpFromError(e)).json({ error, detail: e.message, sqlCode: typeof e.code === 'string' ? e.code : null })`.

## 2026-04-16 STEP 5 Phase 5A | Shadow mode safe by design — monolithe reste source de verite + safe-failure absolue
Contexte : premiere brique de cutover multi-tenant. Risque principal identifie : une erreur cote tenant DB (mal provisionee, corruption, lock, colonne manquante) qui casserait silencieusement la prod. Deuxieme risque : faux diffs dus a un ordre de cles different entre 2 SELECT SQLite (pollution du log, desensibilisation aux vrais diffs). Troisieme risque : table `tenant_shadow_diffs` qui gonfle si on log chaque lecture (impact disque + cout lookup admin).
Regles design appliquees (toutes issues du brief user) :
1. **Monolithe = source de verite absolue pendant shadow**. `shadowCompare()` renvoie TOUJOURS le resultat monolithe, jamais le tenant. Si monolithe throw → propage (comportement actuel inchange). Si tenant throw → swallowed + diff loggue avec `tenantError`.
2. **Safe-failure en cascade**. Tout code qui touche au hash, a `stableStringify`, a l'INSERT `tenant_shadow_diffs` est dans un try/catch qui swallow en console.warn. La prod ne doit JAMAIS casser a cause de shadow. Validation : TEST 6 (monolith throws propages) + testabilite d'un CT write failure sans affecter le retour.
3. **stableStringify recursif**. Tri lexicographique des cles A TOUS LES NIVEAUX. `undefined → null` (sinon `JSON.stringify` skip). Date → `{__date: ISO}`. Buffer → `{__buf: base64}`. Sans ca, deux SELECT identiques avec colonnes en ordre different produisent 2 hashes differents = 100% de faux positifs.
4. **Diff-only logging**. On ecrit UNIQUEMENT en cas de mismatch ou tenant error. Les matches n'ecrivent rien. Sur une route a 1M req/jour avec 0 divergence, la table reste vide. Index compose `(companyId, feature, timestamp DESC)` pour lookup admin rapide.
5. **payloadSample borne**. Max 2000 chars de JSON. Arrays tronques aux 5 premiers items avec un marker `__truncatedArray: true, totalLength: N`. Garde le log utile pour debug sans gonfler la CT. Pas d'INSERT de payload integral meme en cas de diff massif.
6. **Kill-switch global**. Une company en `tenantMode='legacy'` ne peut JAMAIS faire du shadow ou du tenant, meme si `tenantFeatures[x]='tenant'`. Rollback en 1 UPDATE. Fail-closed : companyId inconnu → `'legacy'` (jamais `'shadow'`/`'tenant'` par defaut).
7. **Feature flag hybride (mode global + JSON par feature)**. Evite la tyrannie du "une company = un mode unique" tout en gardant un override global pour rollback panic.
**Regle** : Pour toute phase de cutover progressif d'un monolithe vers une architecture distribuee (multi-tenant, microservices, DB par customer), la fondation technique doit etre DEPLOYEE EN PROD AVANT qu'une seule route soit cablee. Shadow = lecture parallele + hash + diff-only log, jamais d'ecriture divergente. Monolithe reste maitre jusqu'a ce que le shadow log soit vide sur une fenetre de validation. Rollback instantane exige une colonne de kill-switch (ici `tenantMode`) qu'un UPDATE restaurera a l'etat anterieur. Tests unitaires obligatoires sur : (1) determinisme du hash, (2) safe-failure tenant, (3) propagation monolith, (4) absence de diff en cas de match, (5) fallback fail-closed sur companyId inconnu.

## 2026-04-16 v4 bis | Premier commit reel en prod — validation du pattern stubs+remap a l'echelle reelle
Observation factuelle sur commit MON BILAN (donnees reelles snapshot VPS) : **609 refs contacts** orphelines remappees vers `__deleted__` + **1 ref collaborator** remappee vers `__deleted_collab__`. Zero perte de donnees, zero FK violation, zero orphan residuel, integrity `ok`. Commit CAPFINANCES : zero orphan (petite DB, propre). Meme moteur, 2 profils de dette technique opposes, zero intervention manuelle.
Validation empirique : le pattern `TENANT_STUB_TABLES` (companies stub) + `REMAP_PARENTS` iteratif (contacts + collaborators) + `insertPlaceholderRow` auto-fill NOT NULL + diffCounts adjustment produisent un commit propre a partir de ZERO intervention sur la source. Preuve que l'abstraction tient sur vraie donnee, pas juste sur tests synthetiques.
**Regle** : Une migration multi-tenant n'est pas validee par des tests synthetiques, meme exhaustifs. Elle est validee par un dry-run sur snapshot reel suivi d'un commit avec chiffres verifiables (nombre de refs remappees, nombre de stubs inseres, size finale vs source). Garder dans les releases notes l'empreinte chiffree du premier commit reel (ici 609+1) — sert de baseline pour detecter une regression future. La monolithe n'est JAMAIS modifiee pendant cette operation : toutes les transformations sont cote tenant DB.

## 2026-04-16 v4 | Silent failure sur `--commit` — early return incomplet + CLI qui n'imprime pas l'erreur = diagnostic impossible
Symptome : `node server/scripts/migratePilotTenant.js <id> --commit` retournait `ok: false`, `size: NaN KB`, `elapsed: undefined ms`, aucun code d'erreur, aucune stack trace, aucun detail d'etape. Le dry-run precedent avait fonctionne. User bloque 100% en aveugle.
Cause racine (double) : (1) moteur — une branche early-return dans `migrateCompany` retournait `{ ok: false, error: 'TENANT_DB_ALREADY_EXISTS', tenantDbPath }` sans `sizeBytes`/`elapsedMs`/`stack`/`currentStep`, donc tout calcul downstream `(x/1024).toFixed(1)` produisait `NaN` et tout affichage de step n'avait rien a lire. (2) CLI — le script d'affichage imprimait `report.tenantDbPath` / `report.sizeBytes` / `report.elapsedMs` mais JAMAIS `report.error` ni `report.stack` ni `report.currentStep`. Meme si le moteur avait remonte une erreur propre, le CLI l'aurait masquee. Cerise : le vrai declencheur de cette branche etait qu'un dry-run anterieur laisse une tenant DB sur disque (legitime pour inspection), et tout commit suivant heurtait cette garde "file exists".
Fix applique : (1) helper `buildErrorReport({ companyId, company, tenantDbPath, dryRun, currentStep, startedAt, error, stack, extra })` en tete de `tenantMigration.js` — garantit la forme complete du report (toutes les sections nullables, sizeBytes=0, elapsedMs calcule depuis startedAt) pour que le CLI ne fasse jamais d'arithmetique sur `undefined`. Tous les `return { ok: false, ... }` passent par ce helper. (2) tracker `currentStep` traverse 14 phases (sanity → commit_control_tower). Un catch global autour de la phase migration + un try/catch isole autour de l'ecriture control tower preservent le report migration meme si la phase CT echoue. (3) pre-existing artifact check intelligent : lookup control tower d'abord. Si `tenant_databases` contient deja le companyId ET commit demande → refus propre `TENANT_ALREADY_COMMITTED` avec hint "rollback first". Sinon (leftover dry-run non commite) → cleanup des fichiers `.db`/`-wal`/`-shm` et on continue. Debloque le flow standard dry-run → commit. (4) CLI : bloc `ERROR` proeminent imprime `report.error` + `report.currentStep` + stack complete + hints specifiques par code d'erreur. Number formatting safe-guarde. Exit code 3 pour `TENANT_ALREADY_COMMITTED` (actionnable), 1 pour tout autre echec.
**Regle** : Tout report d'operation complexe doit avoir une FORME STABLE garantie — meme en cas d'echec, tous les champs numeriques/texte attendus par les consumers downstream doivent etre presents (0 ou null, jamais undefined). Construire ce contrat via un helper centralise (`buildErrorReport`) et y passer TOUS les early returns. Parallelement, tout CLI doit imprimer `report.error` + `report.stack` + `report.currentStep` des que `!report.ok` — ces champs ne sont pas optionnels. Enfin : quand une garde refuse une action parce qu'un artifact existe deja, ne JAMAIS trancher uniquement sur la presence du fichier. Croiser avec une source de verite canonique (ici control tower) pour distinguer leftover innocent vs etat valide a preserver. Test anti-regression : simuler un `--dry-run` suivi de `--commit` dans le test harness et verifier que le flow se deroule sans manual cleanup.

## 2026-04-16 v3 | Remap orphans — generaliser le pattern des le premier blocage (ne pas copier-coller)
Symptome : dry-run MON BILAN a remonte un dernier orphan sur `collab_heartbeat.collaboratorId -> collaborators` apres v2 qui ne couvrait que `contacts`. Premier reflexe : dupliquer le bloc de code pour `collaborators`. Mauvaise idee : chaque futur orphan (calendars, roles, tickets...) aurait demande un copier-coller de plus = 4-5 branches specifiques a maintenir.
Cause racine : la v2 avait un objet `remapReport = { contacts: ... }` hardcode, alors que `remapOrphansForParent` etait deja generique. La structure de donnees d'appel n'avait pas suivi la generalisation du helper.
Fix applique : extraction d'une constante `REMAP_PARENTS = [{parent, placeholderId, extras}, ...]` en tete de `tenantMigration.js`, et boucle sur cette liste dans `migrateCompany`. `diffCounts` iterait deja `remapReport` en O(n) donc ZERO changement requis cote diff. Ajouter un futur parent = 1 ligne dans `REMAP_PARENTS`. Cout d'extension : constant. `placeholder '__deleted_collab__'` distinct pour eviter toute collision semantique avec `'__deleted__'` de contacts.
**Regle** : Quand un pattern est applique pour la 1ere fois (ici contacts), il n'y a pas d'evidence qu'il faudra le repeter. Quand il est applique pour la 2e fois (ici collaborators), extraire IMMEDIATEMENT la liste/config en constante — avant meme d'avoir une 3e occurrence. Critere : "si j'ajoute un 3e cas, est-ce qu'il y a UNE ligne a changer ou faut-il ecrire encore un bloc de code ?". Si c'est la 2e option, le pattern n'est pas encore generalise — generaliser maintenant, pas plus tard. Tests : ajouter 1 assertion specifique par parent, pas un test complet duplique.

## 2026-04-16 v2 | Migration tenant — FK declarees vers table GLOBAL + orphans FK implicites
Symptome (dry-run reel sur snapshot VPS, pre-commit) : (1) `PRAGMA foreign_key_check` a leve des centaines de violations parce que `collaborators`, `calendars`, `contacts`, etc. declarent `FOREIGN KEY (companyId) REFERENCES companies(id)` mais la table `companies` etait en `GLOBAL_TABLES` donc absente de la tenant DB. (2) `validateOrphanFks` a detecte des centaines de contacts orphelins (refs depuis `call_logs`, `pipeline_history`, `sms_messages`, `notifications`, `conversations`) — contacts supprimes au fil du temps dans la monolithe, refs pas nettoyees.
Cause racine : un schema multi-tenant issu d'une monolithe a deux dettes structurelles invisibles : les FK declarees vers des tables reclassees GLOBAL (on ne peut pas juste exclure le parent sans casser les FK enfant) ET les refs orphelines invisibles au PRAGMA (convention xxxId sans FOREIGN KEY declaree). Un "dry-run pur" echoue donc systematiquement sur la vraie donnee meme si le moteur est correct.
Fix applique : (1) concept `TENANT_STUB_TABLES` — pour chaque table GLOBAL referencee par FK declaree depuis une table tenant, on replique la STRUCTURE dans la tenant DB et on seede UNE SEULE ligne (celle correspondant au tenant, filtrage par id=companyId). Les FK declarees sont satisfaites, zero fuite cross-tenant, rollback trivial (drop tenant DB). Pour le pilote : uniquement `companies`. (2) concept placeholder `__deleted__` — generique via `remapOrphansForParent(tenantDb, companyId, parent, placeholderId, extras)` : detecte orphans via IMPLICIT_FKS, insere 1 ligne placeholder, UPDATE toutes les refs orphelines vers l'id placeholder. `insertPlaceholderRow` auto-remplit les colonnes NOT NULL sans defaut (0 pour INT, '' pour TEXT, Buffer.alloc(0) pour BLOB). Idempotent. diffCounts soustrait +1 de tenant count pour preserver la parite. Historique metier preserve (audit, RGPD).
**Regle** : Pour toute migration multi-tenant d'une monolithe, ne JAMAIS supprimer les FK declarees vers une table reclassee GLOBAL (cassure schema legacy trop risquee) — privilegier le pattern STUB (structure + 1 ligne filtree). Ne JAMAIS supprimer les donnees orphelines (valeur metier + RGPD + audit) — privilegier le pattern PLACEHOLDER. Les dry-runs purs (sur donnees reelles) sont un outil de detection de dette — inspecter le report, ne pas corriger la donnee source, ajouter les helpers de migration pour la transformer idempotamment. Tests dedies : injecter un orphelin volontaire ET un schema realiste (FK declarees + colonnes NOT NULL) avant de lancer le premier dry-run sur prod.

## 2026-04-16 | Migration multi-tenant — tables SANS companyId mais TENANT en realite (6 tables, dont bookings)
Symptome (evite avant impact) : le moteur de migration initial (STEP 4) reposait sur `tableHasCompanyId(sourceDb, table)`. Toute table sans cette colonne etait skip avec `note: 'no_companyId_column_skipped'`. Scan preventif a revele 6 tables sans companyId HORS GLOBAL_TABLES : `availabilities`, `bookings` (critique, coeur produit), `google_events`, `role_permissions`, `ticket_messages`, `reminder_logs` (2-hop). Un dry-run sans correction aurait produit un "succes" avec bookings absents → tenant DB utilisable techniquement mais produit casse.
Cause racine : convention de modelisation historique — quand la relation parent-enfant est "evidente" (bookings -> calendars via calendarId), le dev n'a pas redonde companyId dans l'enfant. Ces tables sont tenant-scoped PAR TRANSITIVITE, pas par colonne.
Fix applique : ajout `INDIRECT_TENANT_TABLES` (Map tableName -> {fk, parent}) dans tenantSchema.js + `buildParentIdsSubquery` recursif (supporte 2-hop reminder_logs -> bookings -> calendars) dans tenantMigration.js. copyTenantData distingue 3 modes : direct / indirect / skipped (log explicite). diffCounts applique la meme logique pour verifier l'egalite source vs tenant sur TOUTES les tables, y compris indirectes. Bonus : `validateOrphanFks()` pour les 42 FK IMPLICITES (non declarees) detectees dans le schema — `PRAGMA foreign_key_check` ne les voit pas, il faut les valider par `NOT IN` manuel. Test dedie `testTenantMigration.mjs` avec source DB synthetique : 2 companies, verifie 0 fuite cross-tenant, 2-hop reminder_logs copies, orphelin injecte detecte.
**Regle** : Pour toute migration multi-tenant (SaaS passant de monolithe a DB-par-tenant), AVANT le premier dry-run faire un SCAN EXHAUSTIF : (1) lister toutes les tables sans companyId hors global, (2) classifier chacune migrate-indirect / ignore / reclassify-global avec rationale documentee, (3) lister toutes les colonnes `xxxId` non declarees en FOREIGN KEY (FK implicites invisibles au PRAGMA), (4) implementer sous-requete recursive pour tables indirectes multi-hop, (5) validation manuelle orphelins implicites post-copie. JAMAIS se contenter de `hasColumn('companyId')` comme critere de scope tenant — la transitivite est la norme dans les CRM matures.

## 2026-04-15 | Audit global cross-scope CollabPortal <-> AdminDash — 5 ReferenceError latentes neutralisees
Symptome : console utilisateur crachait `Unhandled Promise Rejection: ReferenceError: Can't find variable: pipelineRightContact` (x3, enqueueJob x5). Le fix initial Marie-Ange n'avait securise que `selectedCrmContact` a L20962/L39258, laissant 5 autres references latentes de variables CollabPortal utilisees hors scope.
Cause racine : le monolithe App.jsx (39 494 lignes) contient CollabPortal (673-19663) et AdminDash (19664-35474) + scope App-level (>35474). Par copie-colle historique, 5 references a des useStates declares uniquement dans CollabPortal survivaient dans AdminDash/App sans garde. Les `x?.id` presents ne protegent PAS : le chaining optionnel ne fait rien contre un ReferenceError sur identifiant non declare (il n'y a pas de binding a court-circuiter).
Verification : script Python croisant toutes les `const [x, setX] = useState(...)` de CollabPortal avec toutes leurs occurrences hors scope, filtrant les redeclarations et les gardes `typeof`. 262 etats CollabPortal-only audites. Faux positifs ecartes manuellement : `docs` (property access `ct.docs`), `loaded` (commentaires), `msgs` (param local de closure), 26 refs de `csvImportModal` L31341-31737 toutes dans `{false && (()=>{...})()}` DEAD CODE. Liste finale verrouillee a 5 points exacts.
Fix applique : 5 diffs groupes en une passe sur App.jsx — L20966 `pipelineRightContact` (handleUpdateContact admin), L23350 `selectedCrmContact`+`pipelineRightContact` (IIFE `_updateContact` booking modal admin), L31064 `setCsvImportModal` (bouton Import CSV admin), L31954 `setPhoneScheduleForm`+`setPhoneShowScheduleModal` (bouton RDV admin), L39261 `pipelineRightContact` (auto-refresh App-level). Pattern uniforme : `if (typeof X !== 'undefined' && X && ... && typeof setX === 'function') { ... }` + double protection sur setter + `console.warn` controle en else pour les setters-only. Validation prod : aucun ReferenceError au demarrage ni au runtime, (a)-(e) valides dans la console navigateur admin.
**Regle** : Pour tout monolithe multi-composants partageant un meme fichier, AVANT tout fix ciblant une ReferenceError cross-scope, lancer un audit script exhaustif (grep structurel + filtrage redeclarations + filtrage gardes existantes + examen manuel des faux positifs DEAD CODE/comments/params). NE JAMAIS faire confiance a un `?.` pour proteger contre un ReferenceError — seul `typeof x !== 'undefined'` le fait. Appliquer les fixes en lot groupe en une passe, pas variable par variable. Documenter la liste exacte avant patch, appliquer, puis re-verifier par grep que toutes les lignes ciblees ont bien le guard.

## 2026-04-15 | Suppression contact bloquee par FK contact_documents (500 silencieux)
Symptome : POST /api/data/contacts/bulk-delete repondait 500 "FOREIGN KEY constraint failed". UI retirait le contact optimistement puis il revenait au refresh. En parallele, crash JS `ReferenceError: selectedCrmContact is not defined` dans AdminDash (variable declaree uniquement dans CollabPortal L2755, referencee hors scope dans AdminDash L20962 et L39255 — copie-colle non adapte).
Cause racine : la table `contact_documents` a une FK explicite `REFERENCES contacts(id)` sans ON DELETE CASCADE. La route bulk-delete faisait directement DELETE FROM contacts sans nettoyer les documents lies prealablement.
Fix applique : envelopper bulk-delete dans une transaction better-sqlite3, supprimer d'abord contact_documents (seule table a FK explicite sur contacts) puis contacts. Utiliser `.changes` au lieu d'incrementer aveuglement. Logs `[CONTACTS BULK-DELETE]` enrichis (cleanedDocs, requested, stack en cas d'erreur). Frontend : guards `typeof selectedCrmContact !== 'undefined' && ...` sur les 2 references hors scope dans AdminDash.
**Regle** : Avant tout DELETE sur une table referencee par FK, lister d'abord les tables dependantes (`.schema | grep <tableName>`), et TOUJOURS supprimer les dependances dans une transaction AVANT la table parente. Ne jamais faire confiance aux optimistic updates cote UI : la FK peut bloquer le backend silencieusement. Pour les variables cross-composants (CollabPortal vs AdminDash), utiliser `typeof x !== 'undefined'` comme guard — le chaining optionnel `x?.id` NE protege PAS contre un ReferenceError sur variable non declaree.

## 2026-04-15 | Stats entreprises Vision Supra — counts stockes en colonnes devenaient stale
Les colonnes `collaboratorsCount`, `calendarsCount`, `bookingsCount` de la table `companies` ne sont plus maintenues dynamiquement (valeurs figées au seed / création). Dans Vision Supra > Entreprises, l'admin voyait 0 collabs alors que la company avait des collaborateurs.
**Regle** : Pour les stats cross-entreprises en Vision Supra, TOUJOURS recalculer en live via un endpoint dedie (GET /api/companies/stats, requireSupra) avec des COUNT/SUM groupes par companyId. Ne plus se fier aux colonnes count dans `companies`. Merger les stats live dans `allCompanies` dans le useEffect existant (tab=vision + visionSubTab) pour refresh a chaque changement de sous-onglet SANS ajouter de hook.

## 2026-03-19 | DB production ecrasee par rsync | Toujours exclure les fichiers DB dans deploy.sh
Le fichier `deploy.sh` excluait `server/calendar360.db` mais le vrai fichier est dans `server/db/calendar360.db`. Le rsync avec `--delete` a ecrase la DB production (630KB) avec le fichier local vide (0 bytes).
**Regle** : Verifier que TOUS les chemins DB sont exclus dans deploy.sh.

## 2026-03-19 | React crash #310/#300 — useState dans IIFE conditionnel | JAMAIS de hooks dans des IIFEs
React exige que les hooks soient appeles dans le MEME ORDRE a chaque render. Les IIFEs conditionnels changent l'ordre.
**Regle** : Toujours declarer les hooks au niveau du composant (top-level). Utiliser le state parent pour les IIFEs.

## 2026-03-19 | Variable non definie dans scope admin | Verifier la portee entre CollabPortal et Admin
CollabPortal = lignes 540-8159. Admin = lignes 8200+. Ne jamais utiliser une variable d'un scope dans l'autre.

## 2026-03-19 | call is not defined — variable scope try/catch
`const call` dans un `try {}` n'est PAS accessible apres le `catch`. Utiliser une ref ou declarer avant le try.

## 2026-03-19 | callContext.js auth middleware incompatible
Le fichier avait son propre `requireAuth` qui cherchait `x-auth` au lieu du Bearer token global. Fix: verifier `req.auth` d'abord.

## 2026-03-19 | Nginx config Plesk — NE JAMAIS ecraser le fichier genere
La stack est Nginx (443) → Apache (7081) → Node.js (3001). Le fichier `/etc/nginx/plesk.conf.d/ip_default/calendar360.fr.conf` est genere par Plesk. Si on l'ecrase avec une config custom incomplete, le site tombe.
**Regle** : Utiliser `vhost_nginx_ssl.conf` dans `/var/www/vhosts/system/calendar360.fr/conf/` pour les ajouts custom. NE JAMAIS toucher aux fichiers dans `/etc/nginx/plesk.conf.d/`. Pour restaurer : `plesk repair web -domains-only`.

## 2026-03-19 | Refonte massive UI — strategie de remplacement par chunks
Pour remplacer ~3270 lignes dans un fichier monolithique (App.jsx): ecrire le code en 6 parties dans /tmp/, assembler avec cat, puis injecter via Python (lire fichier, trouver les bornes, reconstruire). Garder un .bak. Builder AVANT de deployer.
**Regle** : Pour les remplacements > 500 lignes, utiliser un script Python de splice plutot que Edit. Toujours builder pour valider la syntaxe JSX.

## 2026-03-19 | Caractere > dans JSX — arrow -> non valide
Le caractere `>` est interprete comme fermeture de tag JSX. Utiliser `{"→"}` ou `&gt;` a la place de `->`.
**Regle** : Ne jamais utiliser de fleche ASCII dans du texte JSX inline.

## 2026-03-19 | PM2 cluster mode bloque les WebSockets
PM2 en cluster mode ne forward pas les WebSocket upgrade requests. Fix: `exec_mode: 'fork'` dans ecosystem.config.cjs. MAIS il faut `pm2 delete` puis `pm2 start` (pas juste restart) pour changer le mode.

## 2026-03-19 | Stages pipeline desynchronises — contacts disparaissent du pipeline
La fiche contact (phone tab) utilisait 5 vieux stages (en_cours, proposition, gagne) avec des IDs differents des 7 stages CRM (contacte, qualifie, client_valide). Quand on changeait le statut sur la fiche, le contact recevait un stage ID qui n'existait pas dans le pipeline kanban → le contact disparaissait de toutes les colonnes.
**Regle** : Il y a UNE SEULE source de verite pour les stages pipeline = les 7 stages CRM. JAMAIS definir une autre liste de stages ailleurs. Toujours utiliser PIPELINE_STAGES ou DEFAULT_STAGES.

## 2026-03-19 | WebSocket proxy via Plesk — complexe
La chaine Nginx → Apache → Node.js ne laisse pas passer les WebSockets facilement. Apache `.htaccess` ne supporte pas `mod_proxy_wstunnel`. La seule approche qui marche : ajouter un `location` dans la config Nginx custom Plesk (`vhost_nginx_ssl.conf`) qui bypass Apache et va directement a Node.js pour le path WebSocket.

## 2026-03-19 | API contacts sans companyId + appels directs hors handler centralise
Plusieurs appels PUT/DELETE vers `/api/data/contacts/` etaient faits directement via `api()` au lieu de passer par `handleCollabUpdateContact` (CollabPortal) ou `handleUpdateContactLogged` (AdminDash). De plus, aucun de ces appels n'incluait `companyId` dans le body, ce qui posait probleme pour le filtrage multi-tenant cote backend.
**Regle** : Toujours utiliser les handlers centralises pour modifier les contacts. Toujours inclure `companyId` dans le body des appels PUT/DELETE contacts. AdminDash doit recevoir `pipelineStages` en prop pour merger les stages custom avec les stages par defaut.

## 2026-03-20 | Semicolon manquant en fin de db.exec() — tables non creees silencieusement
La derniere table dans le bloc `db.exec(\`...\`)` de database.js avait `)` au lieu de `);`. better-sqlite3 a silencieusement ignore les nouvelles CREATE TABLE IF NOT EXISTS sans erreur visible (le serveur demarre normalement car les anciennes tables existent deja). Les 8 nouvelles tables n'ont pas ete creees en production malgre un deploy reussi.
**Regle** : Toujours terminer chaque CREATE TABLE par `);` (avec point-virgule) dans le bloc db.exec(). Apres deploy, VERIFIER que les tables existent reellement via sqlite3 `.tables` sur le VPS. Ne pas se fier uniquement a l'absence d'erreurs PM2.

## 2026-03-20 | ALTER TABLE / CREATE TABLE apres deploy — toujours creer manuellement en prod
Les ALTER TABLE ADD COLUMN et CREATE TABLE IF NOT EXISTS dans database.js sont wrappés dans des try/catch individuels. Si une colonne existe déjà, le catch avale l'erreur. MAIS si le serveur redémarre sans que les ALTER aient eu le temps de s'exécuter (ou si la DB est en WAL mode avec un lock), les colonnes ne sont pas créées. Après chaque deploy qui modifie le schema, toujours vérifier et créer manuellement via sqlite3 sur le VPS.
**Regle** : Après `deploy.sh`, toujours vérifier `PRAGMA table_info(table)` pour les nouvelles colonnes et `.tables` pour les nouvelles tables. Si manquantes, les créer manuellement via SSH + sqlite3.

## 2026-03-20 | Hooks hoistes casse les IIFE existants — ne JAMAIS changer le nombre de hooks NULLE PART
Ajouter des useState/useRef/useEffect au niveau AdminDash OU dans un IIFE existant (meme UNE seule ligne) DECALE l'index de tous les hooks React. Erreur #311 "Cannot read properties of null (reading 'inst')". Cela affecte TOUS les onglets admin, pas juste celui modifie.
**Regle** : Ne JAMAIS ajouter/supprimer de hooks (useState, useEffect, useRef, useMemo, useCallback) dans aucun scope du composant AdminDash — ni au parent, ni dans les IIFEs. Pour ajouter un loading state, reutiliser un state existant (ex: dispatchLoading). Pour les nouvelles features, utiliser des variables locales ou des refs existantes.

## 2026-03-19 | Routes Express sans auth middleware — faille critique de securite
6 fichiers de routes n'avaient AUCUNE authentification (data.js, collaborators.js, companies.js, aiCopilot.js, bookings.js + routes manquantes dans voip.js). N'importe qui pouvait lire/modifier/supprimer des donnees sans token. En plus, le pattern `companyId || 'c1'` renvoyait les donnees de la company 'c1' quand aucun companyId n'etait fourni.
**Regle** : Toute nouvelle route DOIT avoir `requireAuth` au minimum. Les GET avec companyId doivent utiliser `enforceCompany`. JAMAIS de fallback `|| 'c1'` — renvoyer 400 si companyId manquant. Verifier TOUTES les routes lors de l'ajout d'un nouveau fichier de routes.

## 2026-03-20 | Leads import — Google Sheet dedup incomplet + pas de phone check
L'import Google Sheet ne verifait que les doublons email, pas les telephones. L'import CSV verifait email ET phone. Resultat: 9078 leads importes mais seulement 7566 visibles car les doublons phone etaient ignores en GSheet mais pas en CSV.
**Regle** : Toujours verifier email ET phone pour la dedup. Utiliser une fonction de dedup partagee (checkDuplicate) pour CSV et GSheet. Ne jamais dupliquer la logique d'import.

## 2026-03-20 | Repurpose de state hooks dans IIFE — stocker data dans states existants
Pour ajouter des fonctionnalites dans un IIFE sans changer le nombre de hooks, repurposer les states inutilises. Ex: `gsheetPreview` → import report, `csvFile` → search term, `csvHeaders` → import logs. Utiliser des aliases clairs (`const searchTerm = csvFile || '';`).
**Regle** : Avant d'ajouter un useState, verifier s'il y a un state existant inutilise ou sous-utilise. Stocker les data supplementaires dans des champs d'objets state existants (ex: `mappingForm._duplicateMode`).

## 2026-03-20 | Securite multi-entreprise — verifyOwnership obligatoire sur PUT/DELETE
Les routes PUT/DELETE qui modifient une ressource par ID doivent TOUJOURS verifier que la ressource appartient a la company de l'utilisateur. Pattern: `verifyOwnership(table, id, req, res)` qui check companyId. Les operations bulk (bulk-status, bulk-delete) doivent ajouter `AND companyId = ?` dans les clauses WHERE.
**Regle** : Toute route PUT/DELETE avec `:id` doit avoir verifyOwnership. Toute route bulk doit avoir enforceCompany + WHERE companyId.

## 2026-03-20 | IA dispatch — merger data supplementaires dans state existant
Pour afficher des scores IA dans le dashboard sans ajouter de hooks, fetcher les scores dans loadData() et les merger dans leadStats: `setLeadStats({...(st||{}), scores: scores || []})`. Cela evite d'ajouter un nouveau useState.
**Regle** : Pour les nouvelles donnees du dashboard, merger dans le state stats/leadStats existant plutot que creer un nouveau state.

## 2026-03-20 | ALTER TABLE try/catch silencieux — TOUJOURS creer manuellement en prod (confirme)
Malgre les try/catch dans database.js, les 9 ALTER TABLE + CREATE TABLE du Leads V4 n'ont PAS ete crees automatiquement apres deploy+PM2 restart. Les grep sur le VPS ont confirme 0 colonnes presentes. Il a fallu les executer manuellement via SSH+sqlite3.
**Regle** : Apres CHAQUE deploy qui modifie le schema, executer les ALTER TABLE manuellement via SSH. Ne JAMAIS se fier au try/catch automatique de database.js en production.

## 2026-03-20 | Extraction module partage — leadImportEngine.js
Pour partager du code entre leads.js et gsheetSync.js (cron), extraire les fonctions communes dans un service dedie (`server/services/leadImportEngine.js`). Les 7 fonctions extraites : uid, logHistory, cleanPhoneForCompare, checkDuplicate, parseCSV, autoDetectMapping, executeImport.
**Regle** : Quand 2+ fichiers ont besoin de la meme logique, extraire dans `server/services/`. Toujours verifier la syntaxe des 2 fichiers apres extraction (`node --check`).

## 2026-04-06 | requireAdmin non importé dans data.js — crash serveur complet
En corrigeant la faille forecast (`requireAuth` → `requireAdmin`), le middleware `requireAdmin` n'etait PAS importe dans `data.js`. Le serveur crashait a chaque requete touchant cette route. PM2 redemarrait en boucle (889 restarts). Login impossible.
**Regle** : Avant d'utiliser un middleware dans un fichier, TOUJOURS verifier qu'il est importe en haut du fichier. `requireAdmin` est dans `middleware/auth.js`, pas dans tous les fichiers de routes. Alternative : utiliser un check inline `if (req.auth.role !== 'admin') return res.status(403)`.

## 2026-04-06 | Audit isolation collab — 13 failles trouvees et corrigees
Audit complet de toutes les routes backend. Regle universelle appliquee :
1. `requireAuth` — user connecte
2. `enforceCompany` ou check inline `companyId === req.auth.companyId`
3. Ownership collab pour non-admin : `assignedTo === req.auth.collaboratorId` (contacts), `collaboratorId === req.auth.collaboratorId` (bookings, calls, SMS)
4. Admin bypass dans SA company
5. Supra bypass global
**Regle** : CHAQUE nouvelle route DOIT suivre cette pyramide. Ne JAMAIS faire confiance aux `companyId` ou `collaboratorId` envoyes par le client — toujours prendre depuis `req.auth`.

## 2026-04-06 | Lookup telephone — ne jamais retourner le contact complet
Le `/api/voip/lookup` retournait TOUTES les colonnes du contact (`SELECT *`). Fix : retourner uniquement `{ id, name, phone, pipeline_stage }`. Minimise la surface d'exposition.
**Regle** : Les routes de recherche/lookup ne doivent retourner que le minimum necessaire (id, nom, phone). Jamais les notes, docs, historique, etc.

## 2026-04-06 | Security Resolution Layer — resolveContext.js
Centraliser TOUTE la reconstruction de contexte dans un seul fichier (`server/helpers/resolveContext.js`). 4 fonctions : `resolveFromCallSid`, `resolveFromPhone`, `resolveFromSession`, `validateWebhookContext`. TOUT ce qui vient de l'exterieur (webhooks Twilio, query params, body) est suspect par defaut.
**Regle** : Ne JAMAIS faire confiance aux companyId/collaboratorId envoyes par le client ou par un webhook. Toujours reconstruire depuis la DB via resolveContext. Priorite : CallSid en DB > phone_numbers en DB > session auth. Pas de fallback heuristique sans journalisation.

## 2026-04-06 | Fallback recording-callback supprime — mieux dropper qu'attacher au mauvais appel
L'ancien fallback attachait un recording au "dernier appel sans recording" — cross-company possible. La regle : si le CallSid ne matche aucun call_log → DROP le recording avec un warning log. JAMAIS de fallback aveugle sur des donnees sensibles.
**Regle** : Preference absolue : "aucun rattachement" plutot qu'un mauvais rattachement. Toujours logger les drops pour investigation manuelle.

## 2026-04-06 | Fallback status 15s — provisoire, cible = suppression
Le fallback temporel sur POST /status (match un appel sans SID dans les 15s) reste une heuristique fragile. Si 2 appels sont lances quasi-simultanement, le mauvais appel peut etre matche. Cible finale : suppression complete du fallback.
**Regle** : Tout fallback heuristique doit etre clairement journalise comme anomalie et revise regulierement. Objectif cible = 0 fallback temporel.

## 2026-03-20 | IIFE avec hooks — DOIT utiliser HookIsolator (corrige #311)
Les IIFEs conditionnels `{tab==='x' && (()=>{ useState(); ... })()}` CAUSENT React error #311 quand on change d'onglet, car le nombre de hooks du composant parent change. La regle "fonctionne si le nombre est FIXE" etait FAUSSE — ca crashait systematiquement au switch d'onglet.
Fix definitif : wrapper chaque IIFE avec hooks dans `<HookIsolator>` (defini ligne 5 de App.jsx). Chaque onglet a son propre scope de hooks, isole du parent.
**Regle** : TOUTE IIFE conditionnelle contenant des hooks (useState, useEffect, etc.) DOIT etre wrappee dans `<HookIsolator>{() => { ... }}</HookIsolator>}` au lieu de `(() => { ... })()`. Les 4 onglets concernes : perfCollab, knowledge-base, leads, objectifs. Pour ajouter un NOUVEL onglet avec hooks, TOUJOURS utiliser HookIsolator.

## 2026-03-20 | Splice Python pour gros remplacements — confirme efficace
Le remplacement de 232 lignes par 531 lignes dans App.jsx (perfCollab IIFE) via script Python fonctionne parfaitement. Lire le fichier, spliter, injecter, ecrire. Toujours garder un .bak et builder pour valider.
**Regle** : Pour tout remplacement > 100 lignes dans App.jsx, utiliser le script Python splice plutot que Edit.

## 2026-03-20 | VoIP pipeline audit — 80% existant, etendre plutot que recrer
Le pipeline VoIP (Twilio → Media Streams → Deepgram → GPT live → post-call AI Copilot) etait deja a 80% fonctionnel. Secure IA (secureIaPhone.js) = POST-CALL uniquement (Whisper). La detection live des mots interdits manquait. Ajoutee dans liveTranscription.js en hookant le handler transcript existant (~80 lignes). Le domaine etait hardcode dans voip.js line 374 — remplace par process.env.APP_DOMAIN.
**Regle** : Toujours auditer l'existant AVANT d'ajouter du code. Ne jamais recreer ce qui fonctionne deja. Etendre les services existants plutot que creer de nouveaux fichiers.

## 2026-03-20 | Column names mismatch — voip_settings.accountSid vs .twilioAccountSid
Les fichiers secureIaPhone.js et aiCopilot.js interrogeaient `SELECT accountSid, authToken FROM voip_settings` mais les vrais noms de colonnes sont `twilioAccountSid` et `twilioAuthToken`. Le code fonctionnait quand meme car les credentials env vars (TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN) etaient definies et le fallback DB n'etait jamais atteint. Mais sans env vars, le fallback echouait silencieusement.
**Regle** : Toujours verifier les noms de colonnes exacts dans database.js avant d'ecrire un SELECT. Ne pas copier un SELECT d'un fichier a un autre sans verifier le schema.

## 2026-03-20 | SQL injection via req.body keys — whitelister les colonnes UPDATE
Le PUT /api/voip/calls/:id prenait `Object.keys(req.body)` directement comme noms de colonnes SQL. Un attaquant pouvait envoyer `{ "companyId": "autre" }` pour changer le tenant, ou pire injecter du SQL via les noms de cles. Fix: ALLOWED_CALL_LOG_FIELDS whitelist + filtrage.
**Regle** : Tout UPDATE dynamique base sur req.body doit WHITELISTER les colonnes autorisees. Pattern: `const ALLOWED = ['notes','status',...]; const safeKeys = Object.keys(data).filter(k => ALLOWED.includes(k));`. Ne JAMAIS utiliser Object.keys(req.body) directement dans un SET clause.

## 2026-03-30 | Colonne can_delete_contacts manquante — INSERT collab echouait silencieusement
La route POST /api/collaborators inserait `can_delete_contacts` mais cette colonne n'avait jamais ete ajoutee via ALTER TABLE dans database.js. L'INSERT echouait avec "table collaborators has no column named can_delete_contacts". Le collaborateur apparaissait dans le state frontend (optimistic update) mais disparaissait au refresh car jamais persiste en DB.
**Regle** : Quand on ajoute un champ dans un INSERT, TOUJOURS verifier qu'il existe dans database.js (CREATE TABLE ou ALTER TABLE). Apres deploy, verifier `PRAGMA table_info(table)` sur le VPS. Pattern de verification : chaque colonne du INSERT doit avoir un match dans le schema.

## 2026-03-20 | Deepgram reconnection loop infinie — toujours limiter les retries
L'auto-reconnect Deepgram (on close → setTimeout → connectDeepgram) pouvait boucler indefiniment si la cle API etait invalide ou le quota epuise. Fix: MAX_RECONNECT_RETRIES=3, exponential backoff (2s, 4s, 8s), reset a 0 si reconnexion reussie.
**Regle** : Tout mecanisme de reconnexion automatique doit avoir un max_retries + backoff exponentiel. Logger clairement quand on abandonne.

## 2026-03-20 | Deduplication inserts — Twilio envoie des callbacks multiples
Twilio peut envoyer le meme status callback 2-3x (retries HTTP). Sans dedup, les post-call analyses (Secure IA + AI Copilot) pouvaient etre executees plusieurs fois pour le meme appel, doublant les alertes et les credits IA. Fix: SELECT-before-INSERT dans secureIaPhone.js et aiCopilot.js, plus Map-based dedup dans le status callback handler avec TTL 60s.
**Regle** : Tout processing asynchrone declenche par un webhook externe (Twilio, Stripe, etc.) doit avoir un guard de deduplication. Pattern: `SELECT id FROM table WHERE foreignKey = ?` avant INSERT.

## 2026-03-20 | /api/init renvoie contacts:[] aux collaborateurs — leads dispatches invisibles
Le endpoint `/api/init` (init.js) renvoyait `contacts: []` en dur pour les users avec role 'member' (collaborateurs). Les contacts crees par le dispatch (avec assignedTo=collabId, pipeline_stage='nouveau') existaient en base de donnees mais n'etaient JAMAIS envoyes au frontend du collaborateur. L'admin voyait tout, le collaborateur rien.
Fix: Filtrer les contacts en base pour ne renvoyer que ceux assignes au collaborateur (`assignedTo === collabId`), partages avec lui (`shared_with_json.includes(collabId)`), ou non-assignes (pool commun).
**Regle** : Quand on ajoute une feature qui cree des donnees pour un collaborateur, TOUJOURS verifier que `/api/init` renvoie ces donnees au role 'member'. Le filtrage role-based dans init.js est la porte d'entree — si les donnees ne passent pas ici, elles sont invisibles pour le collaborateur.

## 2026-03-20 | Goal rewards ne dispatchaient pas de leads — completion d'objectif sans effet reel
Le endpoint `check-rewards` creait un `goal_rewards` record avec `leads_awarded` et `envelope_id: null`, mais ne dispatchait AUCUN lead reel au collaborateur. Le systeme semblait fonctionner (goal marque 'completed', record cree) mais le collab ne recevait rien dans son CRM.
Fix: Ajouter `dispatchRewardLeads()` dans goals.js qui cherche l'enveloppe avec le plus de leads dispos, appelle la logique de creation de contact (dedup email/phone, INSERT contacts avec pipeline_stage='nouveau'), et met a jour les incoming_leads + lead_assignments. Ajouter aussi un cron auto-check dans leadDispatch.js (toutes les 15 min).
**Regle** : Toute feature "recompense" doit avoir un effet reel mesurable. Un record dans une table n'est PAS une recompense — il faut une action concrete (dispatch leads, envoi notif, etc.). Tester le flux de bout en bout : objectif atteint → leads dans le CRM du collab.

## 2026-03-20 | Fonctionnalites admin non editables — PUT endpoints backend existaient mais pas dans le frontend
Les endpoints `PUT /api/leads/dispatch-rules/:id` et `PUT /api/leads/envelopes/:id` existaient dans leads.js mais le frontend n'avait aucun bouton d'edition — seulement creer et supprimer. Meme chose pour les objectifs.
**Regle** : Quand on cree un PUT/PATCH endpoint backend, TOUJOURS verifier que le frontend a un bouton/modal d'edition correspondant. Un endpoint sans UI = une feature invisible.

## 2026-03-20 | Twilio webhook signature validation bloque les appels — proxy URL mismatch
Le middleware `validateTwilioWebhook` reconstruit l'URL a partir des headers proxy (`x-forwarded-proto`, `x-forwarded-host`, `host`) pour valider la signature Twilio. Mais la chaine Plesk Nginx → Apache → Node.js modifie les headers, donc l'URL reconstruite ne correspond JAMAIS a celle que Twilio a signee. Resultat: TOUTES les requetes `/twiml/outbound` et `/status` renvoyaient 403 → Twilio raccrochait → erreur 31005 "Error sent from gateway in HANGUP".
Fix: Essayer PLUSIEURS URLs candidates (https://APP_DOMAIN, https://host, http://...) et valider si AU MOINS une correspond. Si aucune ne correspond, loguer un WARNING mais ne PAS bloquer (car le proxy rend la validation unreliable).
**Regle** : Ne JAMAIS bloquer (403) la validation de signature webhook quand on est derriere un reverse-proxy complexe (Nginx → Apache → Node). La reconstruction d'URL est non-deterministe. Utiliser un mode "warn" plutot que "block", ou bypasser la validation si le proxy est connu pour modifier les headers.

## 2026-03-21 | SQL column names phantom — cl.phoneNumber vs cl.toNumber
Les queries dans goals.js utilisaient `cl.phoneNumber` (copie d'un autre fichier) mais la table `call_logs` a `toNumber` et `fromNumber`. Aussi `c.mobile` n'existe pas, seul `c.phone` existe dans contacts. Le try/catch masquait l'erreur en production.
**Regle** : Avant d'ecrire un JOIN entre 2 tables, TOUJOURS verifier les noms de colonnes exacts des DEUX tables via PRAGMA table_info(). Ne JAMAIS deviner un nom de colonne.

## 2026-03-21 | computeGoalProgress cases non-try/catch — cron crash silencieux
Les cases `calls`, `sales`, `appointments`, `contracts` dans computeGoalProgress() n'avaient pas de try/catch individuel. Si une query echouait, le catch global catchait mais l'erreur remontait dans le cron toutes les 15 min. Les nouveaux types (emails, nrp_callbacks, etc.) avaient try/catch car ajoutes plus tard.
**Regle** : TOUT case dans computeGoalProgress() doit avoir son propre try/catch avec fallback `current = 0`. Les queries SQL vers des tables qui pourraient ne pas exister (sms_messages, user_activity_logs) sont particulierement a risque.

## 2026-03-21 | JSX > character — "Si > 0" invalide
Le caractere `>` dans du texte JSX entre balises est interprete comme fermeture de tag. L'erreur de build est un warning (vite compile quand meme) mais polluera les logs.
**Regle** : Remplacer `> 0` par `{'> 0'}` ou reformuler le texte (ex: "Si rempli" au lieu de "Si > 0") dans les strings JSX.

## 2026-03-22 | Twilio recording + Deepgram transcription non fonctionnels — 4 causes racines
1. **recordingEnabled=0 en DB** : voip_settings avait recordingEnabled=0 et recordingConsent=0 pour les 2 companies. Le TwiML generait `record="do-not-record"`.
2. **Deepgram API key invalide (401)** : La cle `3a8c71cf...` retournait HTTP 401. Deepgram n'acceptait aucun audio.
3. **Stream URL = wss://127.0.0.1:3001** : `req.get('host')` derriere le proxy Apache retourne `127.0.0.1:3001` (l'adresse interne). Twilio recevait ce TwiML et essayait de connecter son propre loopback. Fix: utiliser `x-forwarded-host` ou forcer `calendar360.fr` quand host est 127.0.0.1.
4. **PRIORITY 3 n'initialisait pas recordingEnabled** : Le path "company marketplace number" settait callerId mais pas les recording flags.
**Regle** : (a) Toujours verifier les flags boolean en DB apres deploy. (b) Tester les cles API tierces avec curl avant de deployer. (c) Ne JAMAIS utiliser `req.get('host')` pour construire des URLs publiques derriere un reverse proxy — toujours `x-forwarded-host` avec fallback. (d) Chaque branch du priority chain doit initialiser TOUTES les variables dependantes.

## 2026-03-22 | Enregistrements Twilio invisibles — recordingStatusCallback manquant dans TwiML
Le TwiML `<Dial record="record-from-answer-dual">` enregistrait bien cote Twilio, mais sans `recordingStatusCallback`, Twilio ne notifiait JAMAIS notre serveur de l'URL d'enregistrement. Resultat: `recordingUrl` restait vide dans call_logs malgre `recording: true` dans les logs. Fix: ajouter `recordingStatusCallback`, `recordingStatusCallbackEvent: 'completed'` et `recordingStatusCallbackMethod: 'POST'` dans les options du `<Dial>` + creer un endpoint `/api/voip/recording-callback` pour recevoir et sauvegarder le RecordingUrl.
**Regle** : Quand on utilise `record` dans un `<Dial>` Twilio, il faut TOUJOURS configurer `recordingStatusCallback` sinon l'URL d'enregistrement n'est jamais envoyee. Le status callback principal (`/status`) ne recoit PAS le RecordingUrl — c'est un webhook SEPARE.

## 2026-03-22 | Mauvaise DB interrogee — server/db/calendar360.db vs server/calendar360.db
Le path dans database.js est `join(__dirname, '..', 'calendar360.db')` ou `__dirname` = `server/db/`, donc la DB reelle est `/var/www/planora/server/calendar360.db` (5.6 MB). Le fichier `/var/www/planora/server/db/calendar360.db` (970 KB) est un ancien fichier vide/obsolete. Toutes les queries sqlite3 en SSH doivent utiliser le bon chemin.
**Regle** : Toujours verifier le chemin reel de la DB avec `grep 'new Database' server/db/database.js` avant d'interroger en sqlite3 via SSH.

## 2026-03-22 | Cron column name mismatch — ph.created_at vs ph.createdAt
Le cron recycleLostLeads utilisait `ph.created_at` mais la table pipeline_history a une colonne `createdAt` (camelCase). L'erreur spammait les logs toutes les 15 minutes sans impact fonctionnel mais polluait les logs d'erreur.
**Regle** : Toujours verifier les noms de colonnes avec PRAGMA table_info() avant d'ecrire des queries SQL, surtout dans les crons qui tournent indefiniment.

## 2026-03-24 | Forms vides dans fiche contact — fields_json vs fields name mismatch
Le backend callForms.js parse `r.fields_json` (propriete = `fields_json`) mais le frontend cherchait `form.fields` (propriete = `fields`). Resultat: les champs du formulaire etaient toujours un tableau vide, seul le nom du form s'affichait. Fix: utiliser `form.fields_json || form.fields`.
**Regle** : Quand le backend parse des champs `_json`, verifier que le frontend utilise le BON nom de propriete. Le helper `parseRow` dans database.js renomme `xxx_json` → `xxx`, mais les routes qui parsent manuellement (comme callForms.js) gardent le nom original.

## 2026-03-24 | Pipeline stage perdu au refresh — PUT contact fire-and-forget sans error handling
`handleCollabUpdateContact` envoyait le PUT `/api/data/contacts/:id` sans `.then()` ni `.catch()`. Si le PUT echouait (erreur SQL, colonne manquante, auth expirée), l'optimistic update local persistait jusqu'au prochain auto-refresh (30s) qui écrasait avec les anciennes données DB. Le user voyait le changement, puis il disparaissait. Fix: retry x3 avec backoff + revert si echec final + protection auto-refresh (contactsLocalEditRef) pendant 10s apres un edit local.
**Regle** : JAMAIS de fire-and-forget sur les API calls qui modifient des données critiques (pipeline_stage, status, informations contact). Toujours `.then()` pour confirmer + `.catch()` avec retry ou notification d'erreur. Pour l'auto-refresh, ajouter un garde temporel qui empeche l'ecrasement des changements recents.

## 2026-03-25 | sync-batch ecrase pipeline_stage — INSERT OR REPLACE detruit les changements individuels
La route `/api/data/contacts/sync-batch` (toutes les 5 min) faisait `INSERT OR REPLACE` avec TOUS les champs du contact, y compris `pipeline_stage`. Le state local contenait parfois des valeurs obsoletes (avant le dernier PUT individuel). Resultat: le sync ecrasait le pipeline_stage sauvegarde par le PUT avec l'ancienne valeur du state local.
Fix: sync-batch utilise maintenant `UPDATE` (pas INSERT OR REPLACE) et ne touche que les champs "surs" (nom, email, phone, address, tags). Les champs critiques sont PROTEGES: pipeline_stage, notes, nrp_followups_json, nrp_next_relance, contract_*, rdv_status, next_rdv_date, assignedTo, source, createdAt.
**Regle** : sync-batch est un mecanisme de RATTRAPAGE pour les infos de base (nom, email). Il ne doit JAMAIS ecraser les champs modifies individuellement par des PUT. Pattern: UPDATE avec whitelist de colonnes safe.

## 2026-03-25 | Contacts supprimes reviennent — DELETE silencieusement archive au lieu de supprimer
Le DELETE `/api/data/contacts/:id` archivait (pipeline_stage='perdu') au lieu de supprimer si le contact avait des bookings ou calls. Le frontend supprimait du state local, mais l'auto-refresh (60s) rechargeait le contact "archive" depuis la DB → le contact reapparaissait.
Fix: DELETE supprime maintenant DEFINITIVEMENT. L'historique bookings/calls est conserve (references orphelines OK). Le bulk-delete aussi.
**Regle** : Quand l'utilisateur demande de SUPPRIMER, on SUPPRIME. L'archivage silencieux est un anti-pattern qui cree de la confusion. Si on veut archiver, proposer un bouton "Archiver" separe. Ne jamais changer le comportement attendu d'un DELETE.

## 2026-03-25 | REGLE FONDAMENTALE — NE JAMAIS supprimer ou modifier une regle de logique existante
Les regles de logique (dedup, sync, suppression, pipeline stages, validations) sont des INVARIANTS du systeme. Elles ne doivent JAMAIS etre supprimees ou modifiees sans validation explicite de l'utilisateur. Si une regle semble obsolete, DEMANDER avant de la toucher.
**Regle** : Avant de modifier du code qui contient une regle de logique, verifier si cette regle etait intentionnelle. Si oui, la preserver. Si la nouvelle feature entre en conflit avec une regle existante, DEMANDER a l'utilisateur. Les regles sont dans tasks/lessons.md — les relire a chaque session.

## 2026-03-25 | Express route ordering — /contacts/bulk-delete invisible a cause de /contacts/:id
La route `router.delete('/contacts/:id')` etait definie AVANT `router.delete('/contacts/bulk-delete')`. Express matche dans l'ORDRE de definition : `/contacts/bulk-delete` matchait `/contacts/:id` avec `id="bulk-delete"` → tentait de supprimer un contact inexistant → 404/500. La route bulk-delete n'etait JAMAIS atteinte.
**Regle** : Dans Express, les routes LITTERALES (/path/literal) doivent TOUJOURS etre definies AVANT les routes PARAMETRIQUES (/path/:id). Pattern: POST /contacts/sync-batch AVANT POST /contacts, DELETE /contacts/bulk-delete AVANT DELETE /contacts/:id, PUT /contacts/:id/cancel-contract AVANT PUT /contacts/:id. Verifier l'ordre a chaque ajout de route.

## 2026-03-25 | CRM mutualisé entre collaborateurs — contacts sans assignedTo visibles par tous
Les contacts importes par CSV avaient `assignedTo: ""`. Le init.js renvoyait les contacts non-assignes a TOUS les collaborateurs comme "pool commun". Resultat: Jordan et Guillaume voyaient les memes 30 contacts, et les modifications de l'un etaient visibles par l'autre.
Fix: (1) init.js ne renvoie plus les contacts non-assignes aux collaborateurs — un collab ne voit que ses contacts (assignedTo=son_id) + ceux partages (shared_with). (2) L'import CSV assigne automatiquement `assignedTo: collab.id`. (3) Les 30 contacts existants ont ete assignes a Jordan en DB.
**REGLE FONDAMENTALE D'ISOLATION** :
- Chaque collaborateur a son propre CRM isole (ses contacts, son pipeline, ses notes)
- `assignedTo` est OBLIGATOIRE sur chaque contact — jamais vide
- Un contact non-assigne n'est visible par personne (sauf l'admin qui voit tout)
- L'admin peut voir TOUS les contacts de TOUS les collaborateurs
- Le partage entre collaborateurs se fait via `shared_with_json` (explicite)
- L'import CSV/GSheet DOIT toujours mettre `assignedTo: collab.id` du collaborateur importateur
- init.js filtre: `c.assignedTo === collabId || shared_with.includes(collabId)` — PAS de pool commun
- Quand l'admin ouvre le portail d'un collab (`onCollabPortal`), TOUJOURS recharger les contacts filtrés pour ce collab
- Quand l'admin revient à sa vue (`onBack`), TOUJOURS recharger TOUS les contacts company
- Le state `contacts` dans App.jsx est PARTAGE entre AdminDash et CollabPortal — il faut le recharger à chaque switch de vue
- La sync-batch ne doit JAMAIS écraser `assignedTo` (champ protégé dans la whitelist safe)
- Chaque entreprise (company) est un tenant isolé — un collab ne peut voir que les données de SA company
- Chaque collab a un `id` unique rattaché à UN SEUL `companyId` — jamais mutualisé

## 2026-03-25 | Audit sécurité multi-tenant — 9 fichiers de routes corrigés
Audit complet de tous les fichiers server/routes/*.js. Trouvé: routes sans auth, fallbacks `|| 'c1'` dangereux, routes sans enforceCompany, pas de vérification ownership.
**Fichiers corrigés:**
- `backup.js` — ajouté requireAuth + requireSupra (CRITIQUE: les backups DB étaient accessibles sans auth)
- `settings.js` — ajouté requireAuth + enforceCompany, supprimé fallback `|| 'c1'`
- `forms.js` — ajouté requireAuth + enforceCompany, supprimé fallback `|| 'c1'`
- `calendars.js` — ajouté requireAuth + enforceCompany, supprimé fallback `|| 'c1'`
- `aiAgents.js` — ajouté requireAuth + enforceCompany sur toutes les routes CRUD
- `collaborators.js` — ajouté enforceCompany + vérification ownership sur PUT/DELETE
- `secureIa.js` — ajouté requireAuth + enforceCompany, supprimé fallback `= 'c1'`
- `messaging.js` — ajouté requireAuth + enforceCompany
- `bookings.js` — ajouté enforceCompany + ownership check sur PUT

**REGLES SECURITE MULTI-TENANT (PERMANENTES):**
1. TOUTE route Express DOIT avoir `requireAuth` sauf routes publiques (booking page, landing page, webhooks Twilio)
2. TOUTE route qui accède à des données company DOIT avoir `enforceCompany`
3. JAMAIS de fallback `|| 'c1'` ou default companyId — retourner 400 si absent
4. Les routes PUT/DELETE sur une ressource DOIVENT vérifier que la ressource appartient à `req.auth.companyId`
5. Les routes webhooks (Twilio, Stripe) sont les SEULES exceptions à l'auth — les valider par signature
6. `requireSupra` obligatoire pour: backup, accès cross-company, gestion des companies
7. `requireAdmin` obligatoire pour: gestion des collaborateurs, knowledge base, objectifs team
8. Avant d'ajouter une NOUVELLE route, TOUJOURS la protéger avec les bons middlewares

## 2026-03-25 | Audit sécurité V2 — 13 failles cross-company corrigées
Audit complet focalisé sur les vérifications d'ownership (companyId) dans les routes DELETE/PUT.
**Failles CRITIQUES corrigées:**
- DELETE /calendars/:id — AUCUN requireAuth (accessible sans login!) + pas de companyId check
- DELETE /messaging/:id — AUCUN requireAuth + pas de companyId check
- DELETE /contacts/:id — pas de companyId check (suppression cross-company possible)
**Failles MAJEURES corrigées:**
- PUT/DELETE workflows, routings, polls, pipeline-stages — tous sans companyId check
- PUT /contacts/:id/cancel-contract — sans companyId check
- PUT /calendars/:id — sans companyId check
- PUT/DELETE user-goals — sans companyId check
- TOUTES les routes callForms (GET/POST/PUT/DELETE) — AUCUN requireAuth
**Pattern appliqué sur CHAQUE route:**
```javascript
const record = db.prepare('SELECT companyId FROM TABLE WHERE id = ?').get(req.params.id);
if (!record) return res.status(404).json({ error: 'Not found' });
if (!req.auth.isSupra && record.companyId !== req.auth.companyId) return res.status(403).json({ error: 'Accès interdit' });
```
**REGLE**: Après CHAQUE ajout de route PUT/DELETE, vérifier IMMÉDIATEMENT qu'elle a: requireAuth + ownership check companyId

## 2026-03-25 | Auto-refresh écrase contacts du portail collab — vue admin pollue la vue collab
L'auto-refresh (30s) dans App.jsx appelait `/api/init` avec le token ADMIN, recevait TOUS les contacts company, et écrasait le state `contacts` qui était filtré pour un collab spécifique. Résultat: le pipeline du collab voyait tantôt ses contacts, tantôt TOUS les contacts, avec changements aléatoires.
Fix: l'auto-refresh filtre les contacts par `portalData.collab.id` quand on est en vue portail collab.
**REGLE**: Quand `view === 'portal' && portalData?.collab?.id`, TOUT rechargement de contacts DOIT filtrer par assignedTo du collab affiché. Ne jamais écraser le state avec les contacts non-filtrés.

## 2026-03-25 | sync-batch envoie TOUS les contacts company — fuite d'isolation
La sync-batch (5 min) filtrait `c.assignedTo === collab.id || c.companyId === company.id` — le OR faisait que TOUS les contacts company étaient envoyés, pas seulement ceux du collab.
Fix: filtrer uniquement `c.assignedTo === collab.id`.
**REGLE**: sync-batch ne doit syncer que les contacts du collab connecté (assignedTo = collab.id)

## 2026-03-26 | Isolation CRM mutualisee entre collaborateurs | REGLE CRITIQUE
Les contacts avec assignedTo vide etaient visibles par TOUS les collabs. L'auto-refresh ecrasait les contacts filtres avec les donnees admin.
**REGLE ABSOLUE**: Chaque collaborateur ne voit QUE ses contacts (assignedTo === collab.id). L'admin voit tout. Un contact non-assigne n'est visible par personne. NE JAMAIS RETIRER CETTE REGLE.

## 2026-03-26 | Sync-batch ecrase les modifications serveur | Proteger les champs critiques
La sync-batch renvoyait les vieux noms/stages du state frontend, ecrasant les corrections DB.
**Regle**: sync-batch ne doit JAMAIS ecraser pipeline_stage, name, ou assignedTo. Utiliser une liste de champs "safe" uniquement.

## 2026-03-26 | contactsLocalEditRef non defini dans scope telephone | Declarer les refs partagees
Les refs utilisees dans CollabPortal (contactsLocalEditRef) n'etaient pas accessibles dans les callbacks du pipeline telephone.
**Regle**: Declarer les refs partagees au debut du composant, pas dans un scope conditionnel.

## 2026-03-26 | voipState stale dans closure setTimeout | Utiliser useRef pour les closures
Le ring timeout du Power Dialer utilisait voipState (stale closure). Fix: ajouter voipStateRef qui mirror le state.
**Regle**: Pour tout setTimeout/setInterval qui reference un state React, utiliser un ref mirror synce via useEffect.

## 2026-03-26 | Route Express :id capture les sous-routes | Ordre des routes
DELETE /contacts/bulk-delete etait capture par DELETE /contacts/:id (id='bulk-delete'). Fix: mettre les routes specifiques AVANT les routes parametrees, ou changer la methode HTTP.
**Regle**: En Express, TOUJOURS definir les routes specifiques (/bulk-delete) AVANT les routes parametrees (/:id).

## 2026-03-26 | Admin PUT formulaires n'envoie pas les champs | Verifier le mapping body
L'admin envoyait fields_json (deja stringify) au lieu de fields (array). Le backend attendait fields.
**Regle**: Verifier que le nom du champ dans le body correspond a ce que le backend attend. Ne pas double-stringify.

## 2026-03-26 | API POST /api/conversations n'existe pas | Verifier l'existence des routes avant utilisation
Le SMS auto NRP utilisait POST /api/conversations qui n'existait pas (404). Fix: utiliser POST /api/sms/send.
**Regle**: Toujours verifier qu'une route API existe avant de l'utiliser dans le frontend (curl test ou grep dans les routes).

## REGLES DE SECURITE PERMANENTES
1. **ISOLATION COLLAB**: Chaque collaborateur = son propre espace. NE JAMAIS mutualiser CRM/pipeline/contacts entre collabs.
2. **ISOLATION ENTREPRISE**: Chaque company = ses propres donnees. NE JAMAIS croiser les donnees entre companies.
3. **PROTECTION STAGES**: Les pipeline_stage ne doivent JAMAIS etre ecrases par sync-batch ou auto-refresh.
4. **SAUVEGARDE DB**: Backup automatique toutes les 12h + avant chaque deploy majeur.
5. **NE PAS RETIRER DE REGLES**: Si une regle est en place, ne pas la retirer sans demander. Les regles sont la pour securiser la logique.

## 2026-03-26 | prefillKeypad utilisait setCollabTab inexistant | Verifier les noms de state
Le bouton Appeler dans la modale CRM ne faisait rien car prefillKeypad appelait setCollabTab('telephone') qui n'existait pas. Fix: utiliser _setPortalTab('phone').
**Regle**: Toujours verifier que les fonctions setState utilisees existent dans le scope. Utiliser grep pour confirmer avant d'appeler.

## 2026-03-26 | voipState stale dans closure ring timeout | Utiliser ref mirror
Le Power Dialer ne raccrochait pas car le setTimeout capturait la vieille valeur de voipState. Fix: voipStateRef synce via useEffect.
**Regle**: Pour tout callback asynchrone (setTimeout, event listener) qui reference un state React, utiliser un ref mirror.

## 2026-03-26 | setCollab n'existe pas en tant que state setter | Mutation directe + force re-render
Dans CollabPortal, collab est une prop pas un state. setCollab(p=>...) ne fonctionne pas. Fix: mutation directe collab.xxx = v + forcer re-render via un state dummy.
**Regle**: Verifier si une variable est un state local ou une prop avant d'essayer de la setter.

## 2026-03-26 | Toolbar phone surchargee (8 onglets) | Supprimer les elements inutiles
Training IA vide, Calendrier qui redirect, Settings en doublon. Fix: reduire a 5 onglets essentiels.
**Regle**: Chaque onglet doit avoir un contenu reel. Pas d'onglets stubs ou de redirections confuses.

## 2026-03-26 | rsync --delete a ecrase la DB production | JAMAIS --delete sur rsync vers VPS
Le rsync avec --delete a supprime des fichiers serveur (index.js, routes/, et surtout calendar360.db).
**REGLE CRITIQUE**: NE JAMAIS utiliser --delete dans rsync vers le VPS. Utiliser rsync SANS --delete.
**REGLE CRITIQUE**: Toujours exclure server/db/*.db* dans rsync.
**REGLE**: Faire un backup DB AVANT tout deploy: `ssh ... "cp server/db/calendar360.db backups/pre-deploy-$(date +%s).db"`

## 2026-03-27 | Pipeline history accessible cross-collaborateur | Isoler par assignedTo sur toutes les routes pipeline_history
GET et POST `/pipeline-history` ne verifiaient que le `companyId`, pas le `assignedTo` du contact. Un collaborateur pouvait lire et ecrire l'historique pipeline de n'importe quel contact de la company, meme ceux d'un autre collab.

**Bugs supplementaires corriges :**
1. `if (ct &&` utilisé comme guard de securite → si le contact est supprimé (`ct = null`), le check est bypasse silencieusement et l'acces est permis. Corriger avec `if (!ct ||`.
2. GET par `companyId` seul ne joignait pas la table `contacts` → renvoyait tous les historiques sans filtrer par collab.
3. POST utilisait la permission `pipeline.view` au lieu de `pipeline.manage` — une permission en lecture permettait des écritures.

**REGLE ABSOLUE** :
- TOUTE route lisant ou modifiant `pipeline_history` DOIT verifier que le contact appartient au collaborateur (`assignedTo = collab.id` OU `shared_with` contient le collab.id) pour les non-admin.
- Utiliser systematiquement `if (!ct ||` (et JAMAIS `if (ct &&`) comme pattern de guard : si le contact est absent, REFUSER l'acces (contact supprime = acces interdit, pas bypass).
- Admin bypass : `if (req.auth.role === 'admin' || req.auth.isSupra)` → skip le check collab.
- Le frontend (onglet pipeline telephone) doit filtrer identiquement : `contacts.filter(c => c.assignedTo === collab.id || (c.shared_with||[]).includes(collab.id))`.

## 2026-04-07 | Import CSV dedup O(n²) causait freeze sur 1k+ leads | Pré-charger index en Map/Set
La fonction `checkDuplicate()` dans leadImportEngine.js faisait un `db.prepare().all()` par ligne du CSV pour comparer les téléphones — O(n*m) requêtes SQL. Avec 10k leads en DB et 10k lignes CSV = timeout.
Fix: `buildDedupIndex()` charge tous les leads en 1 requête dans 4 Maps (email, phone, name+email, name+phone), puis `checkDuplicateFast()` fait des lookups O(1). `dedupIndexAdd()` garde l'index synchronisé pour la dédup intra-CSV.
**Règle** : Jamais de requête SQL dans une boucle d'import. Toujours pré-charger les données de référence en mémoire avant de boucler.

## 2026-04-07 | assignedTo accepté du frontend sans validation | Forcer côté backend
POST /contacts acceptait `c.assignedTo` du body sans vérifier que le user était admin. Un collab pouvait assigner un contact à un autre collab.
Fix: `if (!req.auth.isAdmin && !req.auth.isSupra) c.assignedTo = req.auth.collaboratorId;` avant l'insert.
**Règle** : Toute valeur d'ownership (assignedTo, collaboratorId) doit être forcée côté backend depuis la session — jamais trustée du frontend.

## 2026-04-07 | ID contacts généré côté frontend = collision possible | UUID côté serveur uniquement
POST /contacts acceptait `c.id` du frontend (`"ct"+Date.now()`). 2 imports rapides pouvaient générer le même ID, et `INSERT OR REPLACE` écrasait silencieusement.
Fix: Ignorer `c.id` du body, toujours générer `'ct_' + Date.now() + '_' + random` côté serveur.
**Règle** : Les IDs de resources doivent toujours être générés côté serveur. Le frontend utilise un tempId local puis reconcilie avec l'ID retourné par l'API.

## 2026-04-07 | Catégorie RDV marquée obligatoire visuellement mais pas validée dans le code
Le champ "Catégorie de RDV *" avait un astérisque dans le label mais aucune validation dans `addScheduledCall()`. Le booking se créait avec `rdv_category: ''`.
Fix: Ajout validation `if(!f.rdv_category) { showNotif('Choisissez une catégorie'); return false; }`.
**Règle** : Si un champ est visuellement marqué obligatoire (*), il DOIT avoir une validation correspondante dans le code. Vérifier les 2 ensemble.

## 2026-04-14 | window._ partage entre onglets = corruption etat | Utiliser _T module-scope
Les 37 variables `window._aiChat`, `window._smsCache`, etc. etaient partagees entre tous les onglets du navigateur. Onglet A modifiait l'etat d'onglet B.
Fix: Objet `_T` en module-scope (chaque onglet a sa propre instance JS).
**Regle** : JAMAIS de `window._` pour stocker de l'etat applicatif. Utiliser des refs, du state, ou un objet module-scope.

## 2026-04-14 | localStorage metier = porosite inter-onglets | Volatile uniquement pour etat metier
Notifications, checklist IA, SMS templates stockes dans localStorage = partages entre onglets et persistent apres deconnexion.
**Regle** : localStorage OK pour preferences UI cosmetiques (dark mode, zoom). INTERDIT pour etat metier (contacts, pipeline, analyses, notifications).

## 2026-04-14 | contacts?.length en dep useEffect = boucle infinie | Utiliser useRef
`useEffect(() => { syncContacts() }, [contacts?.length])` se redeclenchait a chaque ajout/suppression, recreant les timers en boucle.
**Regle** : Si un useEffect doit lire une valeur qui change souvent, utiliser un `useRef` et lire `.current` dans le callback, pas dans les deps.

## 2026-04-14 | updatedAt absent sur contacts = derniere requete gagne | Toujours versionner les donnees critiques
Sans colonne `updatedAt`, deux onglets modifiant le meme contact simultanement → la derniere requete ecrasait la premiere sans detection.
**Regle** : Toute table avec des modifications concurrentes doit avoir `updatedAt` auto-inject + optimistic locking 409.

## 2026-04-14 | contactsRef non nettoye apres delete = resurrection par sync-batch | Purger toutes les sources
Contact supprime en DB, retire du state, mais `contactsRef.current` gardait l'ancien contact. Le sync-batch le re-poussait vers le serveur.
**Regle** : Apres suppression, purger state + ref + selection + bloquer sync 60s.

## 2026-04-14 | collab ne peut pas supprimer un contact assigne a un autre = echec silencieux | Filtrer avant envoi
Backend refusait la suppression (assignedTo mismatch) mais retournait `{success: true, deleted: 0}` sans message d'erreur.
**Regle** : Filtrer les IDs cote front par `assignedTo === collab.id` avant envoi. Afficher un message clair si deleted=0.

## 2026-04-14 | myCrmContacts incluait isUnassigned = CRM mutualise | Isoler par assignedTo
Le CRM collab affichait les contacts sans assignation (assignedTo='') visibles par TOUS les collabs. Le pipeline filtrait correctement par assignedTo mais pas le CRM.
**Regle** : CRM collab = meme filtre que pipeline : owned + shared uniquement. Admin voit tout.

## 2026-04-14 | Visiteurs booking sans contact DB = contacts fantomes dans le CRM | Jamais de tmp_
`myCrmContacts` creait des contacts temporaires `tmp_` a partir des visiteurs de bookings. Ils gonflaient le CRM (69 vs 62) et ne pouvaient pas etre supprimes.
**Regle** : Le CRM ne doit contenir QUE des contacts presents en base de donnees. Un booking sans contact DB ne doit PAS creer de contact temporaire.

## 2026-04-15 | Booking interne sans contactId = contact orphelin | Auto-creer/dedup
POST /api/bookings ne creait pas de contact si `contactId` absent. Le booking existait sans lien CRM.
Fix: Auto-creation/dedup contact dans POST /api/bookings (email+phone, meme company+collab).
**Regle** : Tout booking DOIT etre rattache a un contact CRM reel. Creer automatiquement si absent, avec dedup.

## 2026-04-16 | Commit pilote envoye dans une /tmp/ct-*.db au lieu de la prod | TOUJOURS exporter CONTROL_TOWER_PATH avant migratePilotTenant.js
CAPFINANCES paraissait committee (exit 0) mais `/api/tenant-admin/mode/<id>` renvoyait `TENANT_NOT_FOUND`. Cause : les runs precedents avaient `CONTROL_TOWER_PATH` pointant sur `/tmp/ct-xxx.db` (temp CT utilisee pour les tests). Le script a ecrit dans cette CT temporaire au lieu de `/var/www/planora-data/control_tower.db`.
**Regle** : Tout run `migratePilotTenant.js --commit` sur le VPS DOIT exporter explicitement les 4 envs : `CONTROL_TOWER_PATH=/var/www/planora-data/control_tower.db`, `SOURCE_DB_PATH=/var/www/planora-data/calendar360.db`, `TENANTS_DIR=/var/www/planora-data/tenants`, `STORAGE_DIR=/var/www/planora-data/storage`. A verifier : `env | grep -E "CONTROL_TOWER|SOURCE_DB|TENANTS_DIR|STORAGE_DIR"` avant de lancer.

## 2026-04-16 | Hash mismatch possible par forme de payload divergente | fetchTenant reproduit EXACTEMENT fetchMonolith
Risque : `fetchMonolith` branche admin passe par `getByCompany → parseRows` (shared_with parsed, booleans convertis) ; si `fetchTenant` fait juste `SELECT * FROM contacts` sans `parseRows`, chaque ligne diffre → hash diverge → diff systematique.
**Regle** : En shadow mode, `fetchTenant` DOIT appliquer la meme pipeline de transformation que `fetchMonolith`. Si la branche monolith utilise `getByCompany` (qui applique `parseRows`), la branche tenant DOIT aussi appliquer `parseRows`. Si la branche monolith retourne RAW, la branche tenant retourne RAW.

## 2026-04-16 | Placeholder `__deleted__` en tenant DB = faux positif de diff garanti | Exclure `id != '__deleted__'` dans fetchTenant
La migration remap les orphans de contacts vers un placeholder `id='__deleted__'` (et `__deleted_collab__` pour collaborators). Cette ligne n'a pas d'equivalent monolith → diff systematique.
**Regle** : Dans TOUT `fetchTenant` de shadow mode, ajouter `AND id != '__deleted__'` (contacts) ou `AND id != '__deleted_collab__'` (collaborators). Ne jamais retirer. Si une autre table acquiert un placeholder a l'avenir, etendre la liste d'exclusion en meme temps.

## 2026-04-16 | metaCache 10min = un flip SQL n'est pas visible sans restart | pm2 restart apres tout UPDATE tenantMode/tenantFeatures
Un `UPDATE companies SET tenantMode='shadow' ...` en direct dans la CT ne prend pas effet avant 10 min cote `resolveTenant()` (cache TTL). Risque : croire que le flip a echoue.
**Regle** : Apres tout flip SQL sur `companies.tenantMode`, `companies.tenantFeatures`, ou `tenant_databases.*`, executer `pm2 restart calendar360`. Le cache est in-memory → le restart le detruit. Alternative future : endpoint admin `POST /api/tenant-admin/invalidate/:companyId` qui appelle `invalidateTenant()` sans redemarrer.

## 2026-04-16 | Fixtures frontend = tenant fantome au login supra | Pas de useState(FIXTURE) en multi-tenant
`const [company, setCompany] = useState(COMPANIES[0])` ligne 39107 d'App.jsx initialise le state sur "Cabinet Dupont & Associes" au boot. Le supra admin voit une entreprise qui n'existe pas en DB jusqu'a ce qu'il clique Vision → Connecter.
**Regle** : En multi-tenant, AUCUN `useState` au niveau App ne doit etre initialise avec une fixture de company. Toujours `useState(null)` et forcer la selection via un fetch API ou un ecran multi-tenant. Tout fichier de fixtures (`INIT_*`, `COMPANIES`, `COMPANY_SETTINGS`) doit etre purge du bundle prod OU conditionne par `import.meta.env.DEV`. Aucun mot de passe (meme demo) ne doit exister en dur dans le frontend — ils finissent dans le bundle minifie accessible via DevTools.

## 2026-04-16 | server/seed.js peut etre execute par accident et introduire Dupont en DB | Garde NODE_ENV=production
`server/seed.js` contient l'INSERT de "Cabinet Dupont & Associes" (id='c1') + 4 collabs. S'il est execute en prod (par un `npm run seed` mal place ou un onboarding manuel), il pollue la vraie DB.
**Regle** : Tout script de seed demo doit demarrer par `if (process.env.NODE_ENV === 'production') { console.error('SEED REFUSED IN PROD'); process.exit(1); }`. Deplacer le fichier hors de `server/` (vers `server/scripts/` ou `scripts/dev/`) pour qu'il ne soit jamais charge par erreur par un `require` transitif.
