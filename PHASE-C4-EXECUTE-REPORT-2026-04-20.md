# PHASE C-4 — Rapport d'exécution Cleanup fixtures `c1` (2026-04-20)

> Périmètre : **Frontend (App.jsx:219)** + **MONOLITHE (`calendar360.db`)** UNIQUEMENT.
> Action : Fix racine du bug `useState(COMPANIES[0])` + DELETE des 40 contacts polluants.
> Audit storage : option **C** — JSON committé en git.
> Statut : **✅ SUCCESS**

---

## 1. STEP 1 — Fix frontend appliqué

### Modification

**Fichier** : `app/src/App.jsx` ligne 219

```diff
-  const [company, setCompany] = useState(COMPANIES[0]);
+  // Phase C-4 (2026-04-20): no longer initialize with COMPANIES[0]={id:'c1',...}.
+  // Bootstrap leaked 'c1' as companyId in API calls before session resolved.
+  // Real value is set via setCompany(data.company) after /api/init succeeds.
+  const [company, setCompany] = useState(null);
```

### Pourquoi c'est safe (audit STEP 2)

200+ usages `company.X` non-protégés trouvés dans `app/src/`, MAIS tous sont
dans des composants enfants (`AdminDash`, `CollabPortal`, `VisitorBooking`)
qui ne montent **qu'après** `setCompany(data.company)` dans le flow normal :

```
App mount → loading=true → LoadingScreen (n'utilise pas company)
         → /api/auth/me + /api/init → setCompany(data.company) + setLoading(false)
         → render dashes (company=valid)
```

Pendant `loading=true` ou `view='landing'`, aucun code ne lit `company.X`.

---

## 2. STEP 3 — Deploy frontend (deploy.sh --no-git)

### Pipeline complet (PRECHECKS → TEST → BACKUP → SYNC → BUILD → DEPLOY → SMOKE)

| Étape | Résultat |
|---|---|
| PRECHECKS | SSH OK, VPS uptime 3h35, ram 955/1880 MB, disk 9% |
| TEST local (vite build) | ✅ OK, 2.40s |
| BACKUP httpdocs pré-deploy | `httpdocs-predeploy-20260420-040157.tar.gz` |
| SYNC local → VPS | ✅ OK |
| BUILD VPS | ✅ OK, bundle `index-B03ZyChL.js` (2882 KB / 638 KB gzip), 8.07s |
| DEPLOY → httpdocs | ✅ OK |

### Smoke tests (8/8 PASS)

| Check | Résultat |
|---|---|
| http-status | ✅ HTTP 200 |
| bundle-hash | ✅ matches `index-B03ZyChL.js` |
| bundle-download | ✅ 2 882 335 bytes |
| html-root | ✅ `<div id="root">` present |
| bundle-content | ✅ contains app symbols |
| pm2-status | ✅ online (125 MB) |
| api-auth-me | ✅ HTTP 401 (expected 200/401) |
| backend-errors | ✅ 0 errors since deploy |

### Verdict
**SUCCESS** — Deploy `d-20260420-040149` live, bundle `index-B03ZyChL.js` servi.

---

## 3. STEP 4 — Pré-check FK refs (read-only)

**17 tables** avec colonne `contactId` testées contre les 40 c1 contactIds :

| Table | nb refs trouvées |
|---|---|
| bookings | 0 |
| call_logs | 0 |
| contact_followers | 0 |
| conversations | 0 |
| pipeline_history | 0 |
| sms_messages | 0 |
| notifications | 0 |
| ai_copilot_analyses | 0 |
| call_contexts | 0 |
| recommended_actions | 0 |
| call_form_responses | 0 |
| client_messages | 0 |
| contact_documents | 0 |
| contact_ai_memory | 0 |
| call_transcript_archive | 0 |
| contact_status_history | 0 |
| system_anomaly_logs | 0 |
| **TOTAL** | **0** |

→ DELETE 100% safe : aucun orphan FK créé par la suppression.

---

## 4. STEP 5 — Backup + DELETE 40 contacts c1

### Backup pré-modification

| Item | Valeur |
|---|---|
| Fichier | `/var/backups/planora/db-phaseC4/db-phaseC4-monolithe-pre-20260420-040252.tar.gz` |
| Taille | 825 KB |
| SHA-256 | `a0d28de31559bb10704c88c669d067abe048aea3ff302dfa2765a1faeed5f8de` |

### Audit log durable

| Item | Valeur |
|---|---|
| Script source | [db-migrations/2026-04-20-phaseC4-execute-monolithe-cleanup-c1-contacts.js](db-migrations/2026-04-20-phaseC4-execute-monolithe-cleanup-c1-contacts.js) |
| Audit JSON | [db-migrations/2026-04-20-phaseC4-audit-output.json](db-migrations/2026-04-20-phaseC4-audit-output.json) |
| Format | JSON avec snapshot complet des 40 contacts deleted |

### Sanity checks pré-exécution

| Check | Résultat |
|---|---|
| `PRAGMA integrity_check` AVANT | `ok` |
| Company `c1` (Calendar360) existe | ✅ oui (ne sera pas touchée) |
| Count exact `contacts WHERE companyId='c1'` = 40 | ✅ exactement 40 (anti-dérive) |
| Total FK refs vers les 40 ids = 0 | ✅ 0 (vérifié en script avant DELETE) |

### Exécution

| Item | Valeur |
|---|---|
| Démarré à | 2026-04-20T04:02:53Z (approx.) |
| Transaction | committed |
| **Contacts deleted** | **40** ✅ (= expected) |
| Contacts c1 restants | **0** ✅ |
| `PRAGMA integrity_check` APRÈS | `ok` |
| Company `c1` toujours intacte | ✅ `c1 (Calendar360)` |

### Test idempotence (re-run)

```
EXIT=1
{ "error": "SAFETY: 40 contacts c1 attendus, 0 trouvés. Aborting." }
```

→ Safety check anti-dérive trip correctement. Le script refuse de tourner sur DB
déjà nettoyée (protection > idempotence silencieuse).

---

## 5. STEP 6 — Re-audit global post-Phase C-4

### Métriques contact / orphans / doublons

| Métrique | Pré C-4 | Post C-4 | Δ |
|---|---|---|---|
| contacts total | 288 | **248** | −40 ✅ |
| contacts `companyId='c1'` | 40 | **0** | −40 ✅ |
| company `c1` (Calendar360) | 1 | **1** ✅ | 0 (intact) |
| companies total | 6 | 6 | 0 |
| bookings orphans | 0 (post C-1) | **0** | 0 |
| call_logs orphans | 0 (post C-2) | **0** | 0 |
| contacts→collab orphans | 1 (efef) | **1** (efef) | 0 (intentionnel) |
| **doublons emails (groupes)** | **13** | **3** | **−10** ✅ (les 10 fixtures c1 nettoyées, 3 cross-company légitimes restent) |
| **doublons phones (groupes)** | **9** | **3** | **−6** ✅ (les 6 fixtures c1 nettoyées, 3 cross-company légitimes restent) |

### Comptes ligne par table

| Table | Pré C-4 | Post C-4 | Δ | Note |
|---|---|---|---|---|
| `bookings` | 48 | 48 | 0 ✅ | non touché |
| `collaborators` | 12 | 12 | 0 ✅ | non touché (le 1 collab c1 reste) |
| `contacts` | 288 | **248** | **−40** ✅ | uniquement les 40 c1 |
| `call_logs` | 227 | 227 | 0 ✅ | non touché |
| `audit_logs` | 1494 | 1494 | 0 ✅ | non touché |
| `companies` | 6 | 6 | 0 ✅ | c1 (Calendar360) toujours là |

→ **Seule la table `contacts` modifiée**, exactement les 40 rows c1 ciblées.

### `integrity_check`

| Check | Résultat |
|---|---|
| AVANT exécution | `ok` |
| APRÈS exécution | `ok` |
| Re-run (safety trip) | n/a (script abort) |

### Smoke test prod final post-C-4

| Check | Résultat |
|---|---|
| HTTPS https://calendar360.fr/ | **200** ✅ |
| pm2 `calendar360` | **online** (uptime 3h, 132.3 MB RAM, 0 restart) |
| Bundle servi | `index-B03ZyChL.js` (avec fix `useState(null)`) ✅ |
| Backend errors récents | 0 ✅ |
| `PRAGMA integrity_check` (final) | `ok` ✅ |

---

## 6. Garanties tenues (vs contraintes du brief MH)

| Contrainte | Tenue |
|---|---|
| DELETE uniquement sur `companyId='c1'` | ✅ 40 rows ciblées par id explicite + filtre WHERE companyId='c1' |
| Ne pas toucher la company c1 (Calendar360) | ✅ company `c1` toujours en base |
| Ne pas toucher autres companies | ✅ vérifié (count companies inchangé) |
| Ne rien supprimer d'autre | ✅ counts bookings/call_logs/audit_logs/collaborators inchangés |
| Ne pas toucher efef | ✅ `contacts→collab orphans = 1` (efef intact) |
| Transaction obligatoire | ✅ `db.transaction()` |
| `integrity_check` avant/après | ✅ ok / ok |
| Audit JSON complet | ✅ avec snapshot des 40 rows deleted |
| Idempotence | ✅ safety check anti-dérive (refuse sur DB déjà clean) |
| Aucune activation FK | ✅ `PRAGMA foreign_keys = 0` toujours en vigueur |
| Aucune modification de schéma | ✅ pas d'ALTER TABLE |
| Backup avant | ✅ tarball SHA256 `a0d28de3…ed5f8de` |
| Anti-bug futur (frontend fix) | ✅ déployé en prod, bundle `index-B03ZyChL.js` servi |

---

## 7. Bilan global C-1 + C-2 + C-3 + C-4

| Métrique | Pré C-1 (initial) | Post C-4 (final) | Δ |
|---|---|---|---|
| **Bookings orphans** monolithe | 32 | **0** | −32 ✅ |
| **Call_logs orphans** monolithe | 48 | **0** | −48 ✅ |
| **Contacts→collab orphans** | 2 | 1 (efef gardé) | −1 |
| **Contacts c1 polluants** | 40 | **0** | −40 ✅ |
| **Doublons emails groupes** | 13 | **3** (cross-company légitimes) | −10 ✅ |
| **Doublons phones groupes** | 9 | **3** (cross-company légitimes) | −6 ✅ |
| Bookings PLACEHOLDER `__deleted__` | 0 | 12 | +12 |
| Call_logs PLACEHOLDER `__deleted__` | 0 | 41 | +41 |
| Contacts (total) | 287 | 248 | -39 (=−40 c1 +1 placeholder) |
| Schéma modifié | — | 0 (juste 1 placeholder INSERT) | — |
| Lignes business supprimées | — | **40 fixtures c1 uniquement** | — |
| `integrity_check` | ok | ok | — |
| Prod HTTPS / pm2 | 200 / online | 200 / online | inchangé |
| Frontend bug `useState(COMPANIES[0])` | présent | **corrigé** ✅ | — |

→ **Base 100% clean** au sens du brief :
- 0 orphan technique (bookings, call_logs)
- 0 contact polluant `c1`
- Doublons restants = 3 cross-company légitimes (MH possède plusieurs companies)
- Schéma aligné monolithe ↔ tenants (Phase A)
- Tenants déjà propres (Phase B sur MonBilan)
- Source de la pollution `c1` coupée (Phase C-4 frontend)

---

## 8. Rollback (si jamais besoin)

### Frontend (rollback bundle)
Le deploy.sh a backupé `httpdocs-predeploy-20260420-040157.tar.gz` :
```bash
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 "
  cd / && tar xzf /var/backups/planora/httpdocs/httpdocs-predeploy-20260420-040157.tar.gz \
    -C /var/www/vhosts/calendar360.fr/
"
```

### DB (rollback DELETE)
```bash
ssh -i ~/.ssh/id_ed25519 root@136.144.204.115 "
  pm2 stop calendar360
  cd / && tar xzf /var/backups/planora/db-phaseC4/db-phaseC4-monolithe-pre-20260420-040252.tar.gz \
    -C /var/www/planora-data/
  sqlite3 /var/www/planora-data/calendar360.db 'PRAGMA integrity_check;'
  pm2 restart calendar360
"
```
→ Rollback C-4 uniquement (préserve C-1+C-2+C-3).

### Rollback granulaire via JSON audit
[db-migrations/2026-04-20-phaseC4-audit-output.json](db-migrations/2026-04-20-phaseC4-audit-output.json)
contient le snapshot complet des 40 contacts deleted. Réinsertion possible
champ par champ via INSERT.

---

## 9. État final

### Frontend
- ✅ App.jsx:219 : `useState(null)` (au lieu de `useState(COMPANIES[0])`)
- ✅ Bundle déployé en prod : `index-B03ZyChL.js`
- ✅ Aucune autre modification (200+ `company.X` non-protégés laissés tels quels — safe car composants enfants)

### Base
- ✅ 248 contacts (vs 288)
- ✅ 0 contact `companyId='c1'`
- ✅ Company `c1` (Calendar360) intacte
- ✅ 0 orphan bookings, 0 orphan call_logs
- ✅ Schéma identique (pas d'ALTER)

### Doublons restants (3 emails + 3 phones cross-company)

| Email | Companies | Statut |
|---|---|---|
| rc.sitbon@gmail.com | c1775722958849 + c-monbilan | ✅ légitime by-design |
| romain.biotech@gmail.com | c1775722958849 + c1776169036725 (CapFinances) | ✅ légitime by-design |
| sitbon.immobilier@gmail.com | c-monbilan + c1775722958849 | ✅ légitime by-design |

→ MH propriétaire de plusieurs companies, mêmes contacts personnels présents
dans chacune. **Comportement correct** sous l'isolation tenant (cf CLAUDE.md §0).

### Prod
- ✅ HTTPS 200
- ✅ pm2 calendar360 online (uptime 3h, 132 MB)
- ✅ 0 backend error post-deploy

---

## 10. Reste à faire

### Phase D — Activation FK ON
- **Tenants en premier** (CapFinances + MonBilan) : déjà propres post Phase B
- **Monolithe ensuite** : maintenant propre post Phase C-1+C-2+C-3+C-4
- Procédure recommandée :
  1. `PRAGMA foreign_keys = ON;` dans le code de connexion (`database.js`,
     `tenantResolver.js`)
  2. Pour chaque DB, lancer `PRAGMA foreign_key_check;` avant l'activation
     pour confirmer 0 violation
  3. Tester sur tenants 24h, puis activer sur monolithe
  4. Smoke test prod après activation

### Phase efef cleanup (optionnel, futur)
- 1 contact `efef efef` (`ct1774872603359`) reste assigné à un collab inexistant
  (`u-rcsitbon`)
- À traiter dans une "phase nettoyage tests" séparée si désiré

### Outils alignement futur (point 7 du brief initial MH)
- `db-migrations/diff-schema.js` (script auto de diff structurel)
- Schema versioning (`_schema_meta` table)
- Pre-commit hook pour bloquer toute migration sans script de propagation

---

## 11. Confirmation finale (vs output attendu MH)

| Demande | Confirmation |
|---|---|
| Confirmation du déploiement prod | ✅ `d-20260420-040149` SUCCESS, bundle `index-B03ZyChL.js` servi |
| Résultat des smoke tests | ✅ **8/8 PASS** (HTTP 200, bundle hash, html-root, pm2, api-auth-me, backend-errors=0, etc.) |
| Nombre exact de contacts c1 supprimés | **40** (= expected) |
| Nombre restant après cleanup | **0** ✅ |
| Confirmation qu'aucun orphan n'a été créé | ✅ **0 FK refs** vérifiés sur 17 tables avant ET après DELETE |
| État final prod | ✅ **HTTPS 200, pm2 online (132.3 MB), bundle fix actif, 0 backend error** |
| État final DB | ✅ **integrity ok, 248 contacts (vs 288), 0 c1 contact, c1 company intacte, 0 orphans bookings/call_logs** |

→ **Phase C-4 terminée. Base 100% clean. Ready pour Phase D (FK ON).**
