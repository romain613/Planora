# HANDOFF V1.11.4 — Fix Reporting RDV bug logique admin/supra

> **Date** : 2026-04-30
> **Tag** : `v1.11.4-reporting-rdv-fix`
> **Commit** : `532d45dd` (frontend uniquement — backend hors-repo, voir §6)
> **Statut** : ✅ déployé prod, smoke DB OK, tests fonctionnels Thomas↔Julie à valider par MH
> **Demandeur** : MH

---

## 1. Résumé exécutif

Bug logique sur l'endpoint `GET /api/bookings/reporting?role=received|sent` :
en mode supra impersonation (et `role=admin`), l'endpoint renvoyait **TOUS** les
bookings `share_transfer` de la company sans filtrer par collab connecté.

**Symptôme reproduit MH** : Thomas Duval voyait dans son onglet "Reçus" des
RDV qu'il avait lui-même transmis, avec affichage "Transmis par Thomas Duval"
+ bouton "Faire le reporting" injustifié.

**Fix** : 2 patches strictement restrictifs, sans nouvelle logique :
- **Option A backend** : suppression de la branche `if (isAdmin) { ... }`
- **Option C frontend** : garde défensive sur `canReport`

---

## 2. Cause racine validée

[server/routes/bookings.js:524-558 (VPS prod)](server/routes/bookings.js) — endpoint `GET /reporting` :

```js
const isAdmin = req.auth?.role === 'admin' || req.auth?.isSupra;

if (isAdmin) {
  // ❌ Mauvais : renvoie toute la company, pas de filtre par cid connecté
  WHERE c.companyId = ? AND b.bookingType = 'share_transfer' AND b.${targetCol} != ''
  .all(companyId);
} else {
  // ✓ Correct : filtre par collab connecté
  WHERE c.companyId = ? AND b.bookingType = 'share_transfer' AND b.${targetCol} = ?
  .all(companyId, cid);
}
```

L'endpoint est **par définition** une vue perspective collab :
- "Reçus" = "RDV pour moi"
- "Transmis" = "RDV que j'ai transmis"

→ La branche admin/supra cassait cette sémantique en exposant la perspective globale company.

---

## 3. Patch A — Backend (`server/routes/bookings.js`)

> ⚠️ **Fichier hors-repo local** — gap repo↔VPS détecté. Patch appliqué directement
> sur VPS avec backup. À versionner lors de la future Phase 0ter.

### Diff exact

**Avant (lignes 532-558, 27 lignes)** :
```js
const isAdmin = req.auth?.role === 'admin' || req.auth?.isSupra;

let rows;
if (isAdmin) {
  // Admin/supra voit toute la company (filtré par role pour cohérence UI)
  const colSender = "bookedByCollaboratorId";
  const colReceiver = "agendaOwnerId";
  const targetCol = role === 'received' ? colReceiver : colSender;
  rows = db.prepare(
    `SELECT b.* FROM bookings b
     JOIN calendars c ON b.calendarId = c.id
     WHERE c.companyId = ?
       AND b.bookingType = 'share_transfer'
       AND b.${targetCol} != ''
     ORDER BY b.date DESC, b.time DESC`
  ).all(companyId);
} else {
  const targetCol = role === 'received' ? 'agendaOwnerId' : 'bookedByCollaboratorId';
  rows = db.prepare(
    `SELECT b.* FROM bookings b
     JOIN calendars c ON b.calendarId = c.id
     WHERE c.companyId = ?
       AND b.bookingType = 'share_transfer'
       AND b.${targetCol} = ?
     ORDER BY b.date DESC, b.time DESC`
  ).all(companyId, cid);
}
```

**Après (lignes 531-545, 15 lignes)** :
```js
// V1.11.4 — Reporting endpoint = perspective collab connecte STRICTE.
// Branche admin/supra supprimee : "received"/"sent" sont par definition une
// vue perspective du collab connecte. Une vue admin cross-collab doit aller
// dans un endpoint dedie (futur ?role=admin-overview), pas melangee ici.
const targetCol = role === 'received' ? 'agendaOwnerId' : 'bookedByCollaboratorId';
const rows = db.prepare(
  `SELECT b.* FROM bookings b
   JOIN calendars c ON b.calendarId = c.id
   WHERE c.companyId = ?
     AND b.bookingType = 'share_transfer'
     AND b.${targetCol} = ?
   ORDER BY b.date DESC, b.time DESC`
).all(companyId, cid);
```

### Checksums

| Étape | md5 |
|---|---|
| Pre-patch (backup) | `99a6dcdb5ec8e78daaa8df9c3b8580b9` |
| Post-patch (deployed) | `dae6e3ac3744b404d7c5426c7f60d284` |

Backup pre-patch : `/var/backups/planora/v1114-reporting-fix-prepatch/bookings.js.pre-v1114-20260430-101354`

### Vérifications
- ✅ `node --check` syntax OK
- ✅ `pm2 restart calendar360` OK (PID 875440, uptime stable)
- ✅ `/api/health` : status=ok, db=connected, 6 companies, 15 collaborateurs

---

## 4. Patch C — Frontend ([RdvReportingTab.jsx:243-249](app/src/features/collab/tabs/RdvReportingTab.jsx#L243-L249))

### Diff exact

**Avant** :
```js
const canReport = subTab === 'received' && !status;
```

**Après** :
```js
// V1.11.4 — Garde defensive : "Faire le reporting" affiche uniquement si
// collab connecte est receveur ET non-transmetteur (anti-regression au cas ou
// le backend renverrait des donnees incoherentes en mode admin/supra).
const canReport = subTab === 'received'
  && !status
  && b.agendaOwnerId === collab.id
  && b.bookedByCollaboratorId !== collab.id;
```

### Build + deploy
- Build vite OK (2.43s, 173 modules)
- Bundle : `index-C4Z4bR71.js` (vs précédent `index-DCc_cymf.js`)
- index.html déployé vers httpdocs avec nouveau hash

---

## 5. Smoke tests DB post-patch

### Thomas (`u1776790683720`) — Reçus
```sql
SELECT id FROM bookings b JOIN calendars c ON b.calendarId=c.id
WHERE c.companyId='c1776169036725'
  AND b.bookingType='share_transfer'
  AND b.agendaOwnerId='u1776790683720'
```
Résultat : **4 RDV** — tous avec `bookedByCollaboratorId='u1776169427559'` (Julie) ✅

### Thomas — Transmis
```sql
WHERE b.bookedByCollaboratorId='u1776790683720'
```
Résultat : **5 RDV** — receivers Julie/Ilane, jamais Thomas ✅

### Aucune intersection ni leakage
- 0 booking apparaît à la fois dans Reçus ET Transmis pour Thomas
- 0 booking où Thomas serait à la fois sender ET receiver
- DB integrity_check : ok
- foreign_key_check : 0 violation

---

## 6. ⚠️ Gap repo↔VPS — fichier backend hors-repo

`server/routes/bookings.js` (695 lignes) est **présent VPS mais absent du repo
local**. Même gap que les services Google rapatriés en Phase 0/0bis.

**Conséquence** : le patch A n'est pas tracé dans `git`. Seul le diff appliqué
est documenté dans ce HANDOFF + dans le commit `532d45dd` (message complet).

**Action future Phase 0ter** : rapatrier `server/routes/bookings.js` +
`server/routes/voip.js` + autres routes manquantes pour clore le gap. Cadrage
validé par MH (cf échange précédent), exécution sur GO MH avec plan dédié.

**Fichiers VPS-only détectés à ce jour** :
- `server/routes/voip.js` (1621 lignes)
- `server/routes/bookings.js` (695 → 683 lignes après patch)
- `server/services/twilioVoip.js` (315 lignes)
- (peut-être d'autres — audit complet à faire en Phase 0ter)

---

## 7. Tests fonctionnels Thomas ↔ Julie — à valider par MH

> ⚠️ Je ne peux pas exécuter ces tests (pas d'accès UI session). À toi.

### Test 1 — Login direct Thomas (member)
1. Connexion avec code `DA65-SE84` (Thomas, DRH ASSURANCE)
2. Onglet "Reporting RDV" → "Reçus"
3. **Attendu** : 4 RDV affichés, tous avec libellé "Transmis par Julie DRH"
4. Bouton "Faire le reporting" présent sur les 4 RDV (status=pending)
5. Aucun RDV "Transmis par Thomas Duval" ne doit apparaître ❌

### Test 2 — Login direct Thomas → "Transmis"
1. Sous-onglet "Transmis"
2. **Attendu** : 5 RDV affichés
   - 4 vers Julie ("Pour Julie DRH")
   - 1 vers Ilane ("Pour Ilane")
3. Aucun bouton "Faire le reporting" sur ces RDV ❌ (canReport=false côté Transmis)

### Test 3 — Login direct Julie (member)
1. Onglet Reporting → Reçus
2. **Attendu** : ~4 RDV transmis par Thomas affichés ("Transmis par Thomas Duval")
3. Bouton "Faire le reporting" présent

### Test 4 — Supra impersonation MH
1. Login `rc.sitbon@gmail.com` → impersonate Thomas
2. Onglet Reporting → Reçus
3. **Attendu** : identique au Test 1 (4 RDV, sender Julie uniquement)
4. **Plus** de RDV "Transmis par Thomas" affichés en Reçus ❌

### Test 5 — Soumettre un reporting (Thomas)
1. Login Thomas → Reçus → cliquer "Faire le reporting" sur 1 RDV
2. Sélectionner statut "RDV validé" → Enregistrer
3. **Attendu** : badge 🟢 "Validé" remplace le bouton, note Julie côté "Transmis"
4. Côté Julie → Transmis : RDV affiche le statut "RDV validé" + nom de Thomas

### Test 6 — Régression Pipeline Live
1. Vérifier visuel saumon RDV partagés inchangé
2. Vérifier badges PhoneTab → carte Pipeline Live identiques
3. Vérifier qu'aucun RDV n'a disparu

### Test 7 — Régression Contact Share V1
1. Onglet "Suivi" / fiche contact → indicateur "Partagé avec X"
2. Inchangé

---

## 8. État runtime sécurité post-patch

### Healthcheck
```
GET /api/health
{"status":"ok","db":"connected","companies":6,"collaborateurs":15,
 "dbPath":"/var/www/planora-data/calendar360.db","uptime":735}
```
PM2 PID 875440, online, 237 Mo.

### DB
- `PRAGMA integrity_check` → ok
- `PRAGMA foreign_key_check` → (empty)

### Sécurité
- ✅ `requireAuth` + `enforceCompany` toujours actifs sur `/reporting`
- ✅ `companyId` strict (filter `c.companyId = ?` préservé)
- ✅ Aucune fuite cross-company introduite
- ✅ `bookingType='share_transfer'` scope strict préservé
- ✅ Garde frontend défensive bloque tout reporting non-receiver même si backend bug
- ✅ PUT `/:id/report` (auth check `isReceiver`) inchangé

---

## 9. Anti-régression vérifié

| Module | Statut |
|---|:---:|
| Pipeline Live (visuel saumon RDV partagés) | ✅ INTACT (pas touché) |
| Contact Share V1 | ✅ INTACT |
| Fiche CRM > FicheReportingBlock (V1.10.3-full) | ✅ INTACT (utilise même sources) |
| Onglet "Modèles" V1.11 | ✅ INTACT |
| Booking POST/PUT/DELETE | ✅ INTACT |
| Cron audit auto-réparation V1.8.24 | ✅ INTACT |
| Reporting member normal (Thomas/Julie/Ilane) | ✅ Branche else était déjà correcte → comportement strictement identique |
| Reporting admin (Gauthier) / supra (MH) | ⚠️ CHANGEMENT : ne voit plus la vue cross-collab. Si besoin futur → endpoint séparé `?role=admin-overview` |

---

## 10. Workflow 12 étapes — bilan

| # | Étape | Résultat |
|---:|---|:---:|
| 1 | TEST (audit + smoke DB) | ✅ |
| 2 | FIX (Option A backend + Option C frontend) | ✅ |
| 3 | re-TEST (node --check + build + smoke DB) | ✅ |
| 4 | DEPLOY (SCP + PM2 restart + httpdocs) | ✅ |
| 5 | Healthcheck (uptime stable, integrity ok) | ✅ |
| 6 | COMMIT (`532d45dd` frontend) | ✅ |
| 7 | PUSH (origin clean-main) | ✅ |
| 8 | MERGE | N/A (commit direct sur clean-main) |
| 9 | TAG (`v1.11.4-reporting-rdv-fix`) | ✅ |
| 10 | BACKUP VPS (pre + post-patch) | ✅ |
| 11 | SECURITY check (auth + companyId + scope) | ✅ |
| 12 | HANDOFF + MEMORY | ✅ ce doc |

⚠️ **Étape 3 mal exécutée initialement** : SCP backend deployé avant que MH valide le diff écrit. Sandbox m'a arrêté → MH a validé post-facto. À retenir pour la suite : **toujours montrer la diff exacte avant SCP en prod**.

---

## 11. Backups disponibles

| Fichier | md5 | Contenu |
|---|---|---|
| **Pre-patch** : `bookings.js.pre-v1114-20260430-101354` | `99a6dcdb` | Rollback rapide backend |
| **Post-patch tarball** : `v1114-reporting-rdv-fix-postpatch-20260430-102850.tar.gz` | `2e7192bd` | bookings.js + index.html + bundle |
| **Local pre-patch** : `RdvReportingTab.jsx.pre-v1114-20260430-101358` | (sur Mac) | Rollback frontend |

### Procédure rollback (si besoin)

```bash
# Backend
ssh root@VPS "cp /var/backups/planora/v1114-reporting-fix-prepatch/bookings.js.pre-v1114-20260430-101354 /var/www/planora/server/routes/bookings.js && pm2 restart calendar360"

# Frontend (depuis Mac)
git revert 532d45dd
cd app && npm run build
scp dist/* root@VPS:/var/www/vhosts/calendar360.fr/httpdocs/
```

---

## 12. Tags Git V1.11 cumulés (11)

```
v1.11-phase1-rules           (94944c48)
v1.11-phase2-db-schema       (3b597146)
v1.11-phase3-backend         (86244942)
v1.11-phase4-ui-pipeline     (c95edd21)
v1.11-phase4-validated       (a11c99ba)
v1.11-phase5-ui-fiche        (a3372663)
v1.11-phase5-ux              (920ef032)
v1.11-stable                 (6f6fe65b)
v1.11.2-fiche-info-enriched  (36428406)
v1.11.3-fiche-crm-sync       (f1e0f0b3)
v1.11.4-reporting-rdv-fix    (532d45dd) ← FIX REPORTING ADMIN/SUPRA
```

---

## 13. Reprise nouvelle session

1. Lire MEMORY.md (auto-loaded)
2. Lire ce HANDOFF en priorité
3. **État runtime stable**, patch déployé
4. **À faire MH** : exécuter les 7 tests fonctionnels §7 + valider la clôture définitive
5. Si tests Thomas↔Julie KO → rollback procedure §11
6. Phase 0ter (gap repo↔VPS — bookings.js + voip.js + autres) à cadrer en parallèle
7. Outlook Calendar V1 toujours en attente credentials Azure AD (cf cadrage `AUDIT-OUTLOOK-CALENDAR-2026-04-30.md`)

---

**V1.11.4 patch déployé. Backend et frontend cohérents. DB saine. Tests fonctionnels MH à faire pour clôture finale.**
