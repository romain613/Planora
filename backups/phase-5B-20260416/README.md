# Phase 5B — Shadow read pilote sur GET /api/data/contacts
Date sauvegarde : 2026-04-16

## Contenu

Copies EXACTES du code post-Phase-5B (pre-deploy) :
- `database.js`          → server/db/database.js         (export parseRows ajoute)
- `tenantResolver.js`    → server/db/tenantResolver.js   (getTenantDbForShadow ajoute)
- `data.js`              → server/routes/data.js         (GET /contacts refactore async + shadow branching)
- `shadowCompare.js`     → server/services/shadowCompare.js (5A, non modifie — reference)
- `tenantAdmin.js`       → server/routes/tenantAdmin.js  (5A, non modifie — reference)
- `phase-5B.patch`       → git diff (files dans git history seulement : database.js + data.js)

## Diff summary
- `server/db/database.js`          : +1 mot-cle export devant parseRows (ligne 2042)
- `server/db/tenantResolver.js`    : +33 lignes → nouvelle fonction getTenantDbForShadow
- `server/routes/data.js`          : imports + GET /contacts async refacto (mode legacy inchange,
                                      mode shadow appelle shadowCompare avec exclusion __deleted__)

## Contrat de non-regression
- CAPFINANCES et MON BILAN restent en tenantMode='legacy' a ce stade.
- tant qu'aucune company n'est flip en 'shadow', ce code est DORMANT :
  la branche `if (mode !== 'shadow')` return monolith direct, AUCUN overhead.
- La bascule se fait via SQL UPDATE en control_tower.db + pm2 restart.

## Restauration (en cas de rollback en urgence)

### Option A — rollback par flip SQL (recommande)
Pas besoin de toucher au code. Flip la company a legacy :
```
sqlite3 /var/www/planora-data/control_tower.db \
  "UPDATE companies SET tenantMode='legacy', tenantFeatures='{}' WHERE id='<companyId>';"
pm2 restart calendar360
```
→ La route redevient strictement legacy, aucune lecture tenant.

### Option B — rollback par code (retrait complet Phase 5B)
1. Restaurer les 3 fichiers :
   ```
   cp backups/phase-5B-20260416/data.js            server/routes/data.js
   # tenantResolver.js : supprimer la fonction getTenantDbForShadow (environ
   #   30 lignes apres le bloc getTenantDb, entre le commentaire "STEP 5 Phase 5B"
   #   et la prochaine fonction export).
   # database.js : supprimer le mot-cle "export" devant `function parseRows` ligne 2042.
   ```
2. Redeployer : `./deploy.sh` + `pm2 restart calendar360`
3. Verifier : `curl /api/data/contacts?companyId=<id>` renvoie legacy payload identique.

### Preuve de l'etat sauvegarde
`phase-5B.patch` contient le diff exact vs HEAD pour database.js + data.js.
tenantResolver.js etant untracked dans git, sa version pre-5B est la version
en prod actuelle (ligne 164 termine la fonction getTenantDb ; l'ajout commence apres).
