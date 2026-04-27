# AUDIT — Sauvegarde / Restauration par collaborateur + Sécurisation données collab

> **Date** : 2026-04-27
> **Auteur** : Claude Code (Opus 4.7) — mission audit READ-ONLY
> **Demandeur** : MH
> **Périmètre** : missions 2 + 3 (sauvegarde/restauration par collab + anti-perte données)
> **Mode** : READ-ONLY — aucune modification code/DB/config/déploiement

---

## 0. TL;DR

🟢 **80% du système est DÉJÀ EN PRODUCTION** — phase S1+S2 livrée + opérationnelle.
🟡 **20% restant = uniquement RESTORE** (plumbing API + UI).

| Composant | État | Détail |
|---|:---:|---|
| Table `collab_snapshots` | ✅ | Schéma complet, 49 rows, indexes, intégrité SHA-256 |
| Service backend `collabSnapshots/` | ✅ | 6 modules, 1215 lignes, scope finement défini (17+4 tables) |
| Triggers DB dirty-detection | ✅ | 10 triggers actifs (contacts/followers/bookings/call_logs) |
| Cron auto 5 min | ✅ | Self-registering, fingerprint-aware, anti-doublon |
| Cron retention quotidien 03:15 UTC | ✅ | Politique "20 derniers + 1/h × 24h + 1/j × 7j" |
| Stockage gzippé | ✅ | `/var/www/planora-data/snapshots/<companyId>/<collabId>/*.gz` |
| Backup global infra V1.8.24 | ✅ | DB 6h + Code daily, double-dest GDrive + B2, control_tower inclus |
| **Routes API REST `/api/collab-snapshots/*`** | ❌ | **AUCUNE** (juste `backup.js` requireSupra pour DR global) |
| **Fonction `restoreSnapshot()`** | ❌ | **NON IMPLÉMENTÉE** (write/build/retention OK, restore manquant) |
| **UI frontend "Restaurer ma sauvegarde"** | ❌ | **AUCUNE** |
| **Snapshot pre-restore (sécurité reversibility)** | ⚠️ | Schéma prévoit `kind='pre-restore'`, code à écrire |

**Conclusion** : pas besoin de tout reconstruire. Phase à livrer = **plumbing REST + restore engine + UI minimale** sur fondations solides existantes.

---

## 1. CE QUI EXISTE DÉJÀ (read-only inventaire)

### 1.1 Table `collab_snapshots` (DB monolithe `calendar360.db`)

```sql
CREATE TABLE collab_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  companyId TEXT NOT NULL,
  collabId TEXT NOT NULL,
  createdAt INTEGER NOT NULL,             -- unix ms
  kind TEXT NOT NULL CHECK (kind IN ('auto', 'pre-restore', 'manual')),
  trigger TEXT DEFAULT '',                -- 'dirty-detected' / 'restore-reversibility' / 'user-manual'
  payloadPath TEXT NOT NULL,              -- relatif à SNAPSHOTS_DIR
  payloadSha256 TEXT NOT NULL,            -- intégrité gzip
  payloadSizeBytes INTEGER NOT NULL,
  rowCount INTEGER NOT NULL,
  fingerprint TEXT NOT NULL,              -- hash état pour change-detect
  summaryJson TEXT DEFAULT '{}',          -- counts par table (preview)
  createdBy TEXT DEFAULT '',              -- 'cron' / 'supra-admin:<id>' / 'self:<collabId>'
  expiresAt INTEGER                       -- unix ms, null = pas d'expiration
);
CREATE INDEX idx_csnap_collab ON collab_snapshots (companyId, collabId, createdAt DESC);
CREATE INDEX idx_csnap_expires ON collab_snapshots (expiresAt) WHERE expiresAt IS NOT NULL;
CREATE INDEX idx_csnap_fingerprint ON collab_snapshots (companyId, collabId, fingerprint);
```

**Rows actuels** : 49 snapshots tous `kind='auto' / trigger='dirty-detected'`. Plus récent : 2026-04-26 14:45 UTC pour `u-jordan` (31KB, 290 rows).

### 1.2 Triggers DB de change-detection (10 actifs)

```
trg_csnap_dirty_contacts_ins/upd/del      → set dirtyFlag sur owner + executor
trg_csnap_dirty_followers_ins/upd/del     → set dirtyFlag sur collaboratorId
trg_csnap_dirty_bookings_ins/upd/del      → set dirtyFlag sur collab/meetingCollab/bookedBy/agendaOwner
trg_csnap_dirty_calllogs_ins              → set dirtyFlag sur collaboratorId
```

Ces triggers SQLite mettent automatiquement à jour `collaborators.dirtySinceSnapshotAt` à chaque mutation pertinente. Le cron lit ensuite uniquement les collabs marqués dirty.

### 1.3 Service `services/collabSnapshots/` (6 modules, 1215 lignes)

| Fichier | Rôle | Lignes |
|---|---|---:|
| `scope.js` | Source de vérité du périmètre snapshot (17 DIRECT + 4 CONTACT_JOINED + 16 OUT_OF_SCOPE) | 198 |
| `buildCollabSnapshot.js` | Lecture DB selon scope.js, construction payload JSON | 106 |
| `fingerprint.js` | Hash de l'état pour anti-doublon (skipped-unchanged) | 65 |
| `writeSnapshot.js` | Sérialisation gzip + SHA-256 + insert row metadata | 108 |
| `runSnapshotTick.js` | Boucle complète (lecture dirty → fingerprint → build → write → reset flag) | 106 |
| `retention.js` | Politique purge "20 derniers + 1/h × 24h + 1/j × 7j" | 119 |
| `index.js` | Façade publique | 10 |
| `test-build.js` | Test pure du build | 77 |
| `test-tick.js` | Test du tick complet | 114 |
| `test-retention.js` | Test de la rétention | 144 |
| `test-l2-envelope-flow.js` | ⚠️ Hors scope, semble mal placé (concerne lead_envelopes, pas snapshots) | 168 |

### 1.4 Périmètre snapshot (`scope.js`) — sources

**17 DIRECT_TABLES** filtrées par collabId :
| Table | Mode | Filtre |
|---|---|---|
| collaborators | write-safe | `id = ?` (1 row) |
| **contacts** | write-safe | `ownerCollaboratorId = ? OR executorCollaboratorId = ?` |
| **contact_followers** | write-safe | `collaboratorId = ?` |
| **bookings** | write-safe | `collab/meetingCollab/bookedBy/agendaOwner = ?` |
| call_logs | **read-only-v2** | `collaboratorId = ?` (historique VoIP, ne pas écraser) |
| call_transcripts | read-only-v2 | idem |
| call_contexts | write-safe | idem |
| call_transcript_archive | read-only-v2 | LIMIT 500 |
| ai_profile_history | write-safe | idem |
| ai_profile_suggestions | write-safe | idem |
| dispatch_tasks | write-safe | `collabId = ?` (snake/camel mix) |
| notifications | write-safe | LIMIT 500 récentes |
| recommended_actions | write-safe | idem |
| user_goals | write-safe | `collaborator_id = ?` (snake_case) |
| user_activity_logs | read-only-v2 | LIMIT 2000 |
| lead_assignments | write-safe | `collaborator_id = ?` |

**4 CONTACT_JOINED_TABLES** filtrées via contactIds possédés par le collab :
- contact_ai_memory (write-safe)
- pipeline_history (write-safe)
- contact_status_history (write-safe)
- contact_documents (write-safe — métadonnées seules, fichiers `/storage/` hors scope V1)

**16 OUT_OF_SCOPE** (documenté pour revue MH) :
- audit_logs (tamper-evident, jamais snapshot/restore)
- sessions (infra auth éphémère)
- supra_admins (global)
- sms_messages / sms_transactions / sms_credits (historique externe + facturation)
- voip_credits / voip_transactions / telecom_credits (facturation)
- google_events (sync upstream)
- companies / calendars / workflows / forms / polls / pipeline_stages / contact_field_definitions / settings (config entreprise)
- tickets / ticket_messages (hors périmètre métier collab)

### 1.5 Crons actifs (loaded `server/index.js` L80-81)

```js
// cron/collabSnapshots.js
cron.schedule('*/5 * * * *', () => runSnapshotTick({ kind: 'auto', createdBy: 'cron' }));

// cron/collabSnapshotsRetention.js
cron.schedule('15 3 * * *', () => runRetention());
```

Politique retention :
- Garde les **20 plus récents**
- Garde **1 par heure sur 24h glissantes**
- Garde **1 par jour sur 7 jours glissants**
- Tout le reste purgé (fichier `.gz` + row DB)

### 1.6 Stockage filesystem

```
/var/www/planora-data/snapshots/
└── <companyId>/
    └── <collabId>/
        └── <timestamp>.json.gz    (chmod 0640, gzip, intégrité SHA-256)
```

`SNAPSHOTS_DIR` est configurable via env (défaut `/var/www/planora-data/snapshots`).

### 1.7 Backup global infra V1.8.24 (couche distincte)

Crontab système :
```
7 */6 * * * /bin/bash /var/www/planora-data/backup-cron.sh        # DB 6h
30 2 * * *  /bin/bash /var/www/planora-data/code-backup-cron.sh   # Code daily 02:30 UTC
```

**`backup-cron.sh` (DB toutes les 6h)** :
- Source : `calendar360.db` + `control_tower.db`
- Méthode : `sqlite3 .backup` (safe pour WAL, aucun impact prod)
- Rétention locale : 30 jours
- Lock anti-chevauchement (`flock -n 9`)
- Vérification taille mini (>1KB) + intégrité
- Upload double-destination via rclone : `gdrive-backup:` + `planora-offsite:` (Backblaze B2)
- Alerte Brevo email sur échec

**`code-backup-cron.sh` (Code daily)** :
- Archive tar.gz du backend + .env + ecosystem.config + dist build courant
- Exclut node_modules / .git / dist / logs
- Rétention locale : 14 jours
- Upload double-destination GDrive + B2

**rclone remotes confirmés** : `gdrive-backup:` + `planora-offsite:`

### 1.8 Routes API existantes

`server/routes/backup.js` (397 lignes, 7 routes, **toutes `requireSupra`**) :
- `GET /api/backup/list` — liste les backups DB
- `POST /api/backup/trigger` — déclenche un backup manuel
- `GET /api/backup/download/:filename` — télécharge un backup
- `POST /api/backup/restore/:filename` — RESTORE DB ENTIÈRE (DR)
- `POST /api/backup/upload` — upload backup externe
- `GET /api/backup/full` — backup complet
- `GET /api/backup/full-set` — set complet

→ Conçu pour **Disaster Recovery technique** (admin), **pas pour la restauration UX par collab**.

---

## 2. CE QUI MANQUE — diagnostic précis

### 2.1 ❌ Aucune fonction `restoreSnapshot()`

`grep -rn 'restoreSnapshot\|applySnapshot\|loadSnapshot' services/collabSnapshots/` → **0 résultat**.

Le service écrit, fingerprint, retient — mais **ne sait pas relire** un snapshot pour appliquer un état précédent. C'est le **gros maillon manquant**.

### 2.2 ❌ Aucune route REST `/api/collab-snapshots/*`

`grep -rn 'collab-snapshot\|/snapshots/' server/routes/` → **0 résultat**.

Aucun endpoint :
- `GET /api/collab-snapshots/list?collabId=X` (liste pour le collab + admin)
- `GET /api/collab-snapshots/:id/preview` (counts/diff sans appliquer)
- `POST /api/collab-snapshots/:id/restore` (avec création snapshot pre-restore)
- `POST /api/collab-snapshots/manual` (snapshot manuel à la demande)

### 2.3 ❌ Aucune UI frontend

`grep -rn 'collab-snapshot\|restoreSnapshot' app/src/` → **0 résultat**.

Aucun composant :
- Bouton "Restaurer ma dernière sauvegarde" dans paramètres collab
- Liste historique snapshots avec preview counts
- Modal confirmation avec impact (rows touchées, tables affectées)
- Indicateur "dernier snapshot il y a X minutes" dans bannière paramètres

---

## 3. FAILLES / RISQUES DE PERTE ACTUELS

### 3.1 Suppression contact (`DELETE FROM contacts`)

[server/routes/data.js:822-869](server/routes/data.js)
```js
router.post('/contacts/bulk-delete', requireAuth, enforceCompany, requirePermission('contacts.delete'), ...);
router.delete('/contacts/:id', requireAuth, requirePermission('contacts.delete'), ...);
```

**Risques** :
- Suppression définitive (pas de soft-delete, pas de restore route)
- Trigger dirty fire → snapshot dans 5 min capture l'état SANS le contact
- Si l'utilisateur n'a pas de snapshot AVANT la suppression → perte définitive
- Le contact disparu emporte avec lui : pipeline_history (cascade ?), contact_followers, contact_status_history, custom_fields_json (intégré dans la row supprimée)

**Atténuation existante** :
- Permission `contacts.delete` requise (limite qui peut supprimer)
- Snapshot retention politique conserve **24h × 1/h** → fenêtre de récupération raisonnable
- Backup global DB 6h sur GDrive+B2 → fallback DR (mais lourd, requireSupra)

### 3.2 Bulk delete sans confirmation backend

`POST /contacts/bulk-delete` accepte un array d'IDs. Le frontend a une `confirm()` JS, mais le backend ne re-vérifie pas. Un script malicieux/buggé peut effacer beaucoup en une requête.

**Atténuation** : permission `contacts.delete` + `enforceCompany` + scope companyId.

### 3.3 Update notes/champs custom = overwrite direct

`PUT /contacts/:id` accepte tout objet `updates` et fait `UPDATE contacts SET ...`. Pas de versioning au niveau row. Si quelqu'un overwrite les notes :
- `entity_history` peut tracer (839 rows existent), mais audit ad-hoc
- Snapshot capture l'état mais latence 5 min

### 3.4 Pipeline_stage transitions

`pipeline_history` enregistre les transitions (585 rows). Bonne couverture audit. **Soft-recoverable**.

### 3.5 contact_followers (V7 transferts)

Les transferts Source/Executor sont visibles via `contact_followers`. Les snapshots les captent. **OK**.

### 3.6 Risques side-effects au restore (NON IMPLÉMENTÉ)

Quand le restore sera codé, il faudra prendre garde :
- **FK cascade** : restaurer un contact → faut-il aussi restaurer pipeline_history orphelin ?
- **read-only-v2** tables (call_logs, transcripts) : ne pas écraser → décision "skip" implicite
- **Conflits collabs partagés** : un contact `shared_with` autre collab : si A restaure, le shared_with de A peut retourner à un état où B n'était pas encore partagé → casser le cross-collab UX V1.8.13
- **Bookings annulés** : restaurer un booking dont le créneau est maintenant occupé → conflit ?

→ Ces sujets nécessitent un **mode dry-run / preview obligatoire** + accord MH par classe d'action.

---

## 4. DIFFÉRENCE — Backup global vs Restauration par collab

| Aspect | Backup global infra V1.8.24 | Snapshot collab `collabSnapshots` |
|---|---|---|
| **Périmètre** | DB entière (95 tables) + control_tower | 17+4 tables filtrées par collabId |
| **Fréquence** | DB 6h, code daily | Auto 5min sur dirtyFlag, retention 1/h × 24h |
| **Granularité** | Globale company (pas de collabId) | Par collaborateur |
| **Stockage** | Local 30j + GDrive + B2 | Local SNAPSHOTS_DIR (gzip + sha256) |
| **Use-case** | Disaster Recovery technique | Restauration UX self-service |
| **Acteur** | Supra admin uniquement | Collab lui-même (à venir) + admin |
| **Restore impact** | Replace DB entière → impact tous collabs | Replace data d'1 seul collab → 0 impact autres |
| **État livraison** | ✅ Production V1.8.24 | ✅ Capture / ❌ Restore |

→ **Les deux couches sont complémentaires, pas redondantes**. La V1.8.24 protège l'infra. La phase S à finir protège l'utilisateur final.

---

## 5. ARCHITECTURE PROPOSÉE — Restore par collaborateur

### 5.1 Module backend `restoreSnapshot.js` (nouveau)

```
services/collabSnapshots/
├── readSnapshot.js         (NOUVEAU) — lit + décompresse + vérifie SHA-256
├── previewRestore.js       (NOUVEAU) — diff état actuel ↔ snapshot, retourne counts par table
├── restoreSnapshot.js      (NOUVEAU) — applique snapshot dans transaction SQLite
└── pre-restore-hook.js     (NOUVEAU) — crée un snapshot kind='pre-restore' AVANT toute restore
```

**Flow restore safe** :
1. **Auth check** : collab ne peut restaurer que SES snapshots (collabId match session) ; admin peut restaurer n'importe lequel mais avec log audit
2. **Read snapshot** : décompresse `payloadPath`, vérifie SHA-256, valide schema version
3. **Preview** (obligatoire avant apply) : retourne `{willRestore: {table: count}, willSkip: read-only-v2 tables, conflicts: [...]}` 
4. **User confirmation côté UI** : modal avec impact détaillé
5. **Pre-restore snapshot** : crée un snapshot `kind='pre-restore' / trigger='restore-reversibility' / createdBy='self:<collabId>'` avec l'état CURRENT — permet de revenir si le restore casse quelque chose
6. **Apply transaction** :
   - `BEGIN`
   - Pour chaque table `write-safe` du snapshot : DELETE les rows actuelles du collab + INSERT les rows du snapshot (idempotent)
   - Tables `read-only-v2` : SKIP (ne pas écraser historiques externes)
   - `COMMIT` ou `ROLLBACK` sur erreur
7. **Audit log** : insert dans `audit_logs` (immutable via trigger) avec entityType='collab_snapshot_restore', actor, snapshotId, beforeFingerprint, afterFingerprint
8. **Notification** : toast "Restauration effectuée — X contacts, Y bookings, Z notes restaurés"

### 5.2 Routes REST à créer

```
GET    /api/collab-snapshots/list?collabId=X
       → Liste snapshots d'un collab. Réservé : self ou admin.
       → Retour : [{id, createdAt, kind, trigger, rowCount, payloadSizeBytes, summaryJson}]

GET    /api/collab-snapshots/:id/preview
       → Preview du diff (rows actuelles vs snapshot).
       → Retour : {willRestore: {contacts: 248, bookings: 48, ...}, willSkip: [...], conflicts: [...]}

POST   /api/collab-snapshots/:id/restore
       → Body : {confirmed: true, reason: "user-revert"}
       → Effet : crée snapshot pre-restore + applique dans transaction.
       → Retour : {success: true, beforeSnapshotId: 123, restoredSnapshotId: 117, summary: {...}}

POST   /api/collab-snapshots/manual
       → Body : {collabId, reason}
       → Effet : force un snapshot kind='manual' / trigger='user-manual'
       → Retour : {success: true, snapshotId: 118, payloadSize, rowCount}

DELETE /api/collab-snapshots/:id
       → Soft-delete (marker expiresAt = now). Réservé admin.
       → Permet de purger un snapshot avant retention auto.
```

**Permissions** :
- `list` / `preview` / `manual` / `restore` : `requireAuth` + check `collabId === req.auth.collaboratorId || isAdmin`
- `delete` : `requireAuth` + `requireSupra`

### 5.3 UI frontend

**Onglet "Sauvegardes" dans paramètres collab** (Settings sub-tab nouveau) :

```
┌──────────────────────────────────────────────────────┐
│ 🛡 Mes sauvegardes                                  │
│ ─────────────────────────────────────────────────── │
│ Dernier snapshot : il y a 4 minutes (auto)          │
│ État actuel : ✓ synchronisé                          │
│                                                      │
│ [+ Créer un snapshot manuel]                        │
│                                                      │
│ Historique (20 derniers + 1/h × 24h + 1/j × 7j) :   │
│                                                      │
│ ▸ 27 avr 13:45 · auto · 290 rows · 31KB            │
│ ▸ 27 avr 13:10 · auto · 290 rows · 31KB            │
│ ▸ 27 avr 12:45 · auto · 289 rows · 31KB            │
│ ▸ 27 avr 11:30 · manual · "avant import CSV" · 285 │
│ ...                                                  │
│                                                      │
│ Sur clic d'un snapshot → modal preview :            │
│   ┌──────────────────────────────────────────┐    │
│   │ Aperçu — restauration vers 27 avr 11:30  │    │
│   │                                          │    │
│   │ Sera restauré :                          │    │
│   │   • 248 contacts (vs 246 actuels)        │    │
│   │   • 48 bookings (vs 50 actuels)          │    │
│   │   • 412 entrées pipeline_history         │    │
│   │   • Notes contacts complètes             │    │
│   │                                          │    │
│   │ Sera ignoré (historique externe) :       │    │
│   │   • call_logs, transcripts, activity_logs│    │
│   │                                          │    │
│   │ ⚠ Avant restauration, un snapshot        │    │
│   │   "pre-restore" sera créé pour annuler.  │    │
│   │                                          │    │
│   │ [Annuler]  [Restaurer]                   │    │
│   └──────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

**Indicateur global** : badge "💾 il y a 4 min" dans le profil collab haut-droit.

**Pas de UI admin séparée en V1** — l'admin utilise la même interface en passant par l'impersonation existante.

### 5.4 Sécurité reversibility

Règle dure :
- **Toute restore crée d'abord un snapshot pre-restore** (déjà prévu dans schéma).
- Si l'utilisateur veut "annuler" la restauration : il restaure le snapshot pre-restore (kind='pre-restore').
- Les snapshots pre-restore ne peuvent pas être supprimés par le retention auto pendant 7 jours (champ `expiresAt = now + 7j`).

### 5.5 Garde-fous side-effects

Avant le merge V1, à coder dans `previewRestore.js` :
1. **Cross-collab conflicts** : si un contact à restaurer est `assignedTo` un autre collab dans l'état actuel → bloquer + demander à l'admin
2. **Bookings conflits créneaux** : si un booking à restaurer chevauche un autre booking ou GCal event → preview avec warning, possibilité de skip ces bookings
3. **Custom fields** : valider que les `custom_fields_json` sont compatibles avec les `contact_field_definitions` actuelles (sinon warning "Champ X n'existe plus")
4. **Pipeline stages obsolètes** : si un contact à restaurer a `pipeline_stage = 'old_stage'` qui n'existe plus → warning + remap vers 'nouveau' ou stage par défaut

---

## 6. PLAN D'IMPLÉMENTATION PAR ÉTAPES

### Phase R1 — Restore engine backend (read + apply, sans UI)
**Durée estimée** : 1.5 jour

- [ ] R1.1 — `readSnapshot.js` (décompresse + vérifie SHA-256 + parse JSON)
- [ ] R1.2 — `previewRestore.js` (compute diff + conflicts + warnings)
- [ ] R1.3 — `restoreSnapshot.js` (apply dans transaction, skip read-only-v2, audit_logs)
- [ ] R1.4 — Tests unitaires `test-restore.js` (idempotence, rollback en erreur, scope respecté)
- [ ] R1.5 — Test manuel sur snapshot existant (collab Julie CapFinances)

**Garde-fous** :
- Aucune route REST exposée — service interne uniquement
- Bypass possible via `node test-restore.js` pour validation MH avant exposition
- Rollback : suffit de ne pas merger les fichiers nouveaux

### Phase R2 — Routes REST + auth + audit
**Durée estimée** : 1 jour

- [ ] R2.1 — `routes/collabSnapshots.js` (nouveau fichier, 5 routes listées §5.2)
- [ ] R2.2 — Permission middleware (`isOwnerOrAdmin`)
- [ ] R2.3 — Audit_logs entry sur chaque action
- [ ] R2.4 — Tests E2E (curl scripted)
- [ ] R2.5 — Mount dans `server/index.js`

**Garde-fous** :
- Routes mountées MAIS frontend ne les appelle pas encore → effet zéro côté UX
- Rollback : commenter le `app.use('/api/collab-snapshots', ...)` dans index.js

### Phase R3 — UI frontend (Settings sub-tab + modal preview)
**Durée estimée** : 1.5 jour

- [ ] R3.1 — Settings sub-tab "Sauvegardes" dans CollabPortal
- [ ] R3.2 — Liste historique avec format date / kind / counts
- [ ] R3.3 — Bouton "Créer snapshot manuel"
- [ ] R3.4 — Modal preview restore avec diff visuel
- [ ] R3.5 — Confirmation à 2 étapes (intent + bouton Restaurer)
- [ ] R3.6 — Toast notif post-restore avec rappel "Annuler" (snapshot pre-restore)
- [ ] R3.7 — Indicateur "dernier snapshot il y a X min" dans header collab

**Garde-fous** :
- Feature flag `c360-collab-snapshots-ui` (localStorage) pour désactiver l'UI sans toucher backend
- Tests manuels MH avant retrait du flag

### Phase R4 — Snapshot pre-restore + reversibility (sécurité critique)
**Durée estimée** : 0.5 jour

- [ ] R4.1 — Implémenter création auto snapshot kind='pre-restore' avant chaque apply
- [ ] R4.2 — `expiresAt = now + 7j` pour ces snapshots (immunité retention auto)
- [ ] R4.3 — UI : bouton "Annuler la restauration" (rebascule sur le pre-restore)
- [ ] R4.4 — Test : restore A → restore pre-restore = état initial

### Phase R5 — Side-effects warnings (cross-collab, créneaux, schéma)
**Durée estimée** : 1 jour

- [ ] R5.1 — Detection cross-collab conflicts dans previewRestore
- [ ] R5.2 — Detection bookings créneaux occupés
- [ ] R5.3 — Detection pipeline_stages obsolètes
- [ ] R5.4 — Detection custom_fields incompatibles
- [ ] R5.5 — Mode skip / remap pour chaque catégorie
- [ ] R5.6 — UI affichage warnings dans modal preview

### Phase R6 — Documentation + handoff
**Durée estimée** : 0.5 jour

- [ ] R6.1 — RESTORE-COLLAB.md (procédure utilisateur)
- [ ] R6.2 — Architecture doc dans `docs/collab-snapshots-architecture.md`
- [ ] R6.3 — HANDOFF V1.9.x avec tag git
- [ ] R6.4 — Mémoire delivered

**Total estimé** : ~6 jours-homme cumulés (peut être livré phase par phase, chaque phase shippable indépendamment).

---

## 7. ROLLBACK GLOBAL DU LOT

Aucune phase ne touche aux schémas DB existants ni aux services existants (write/build/retention/cron).

Rollback complet = supprimer :
- Les nouveaux fichiers `services/collabSnapshots/readSnapshot.js`, `previewRestore.js`, `restoreSnapshot.js`
- Le nouveau fichier `routes/collabSnapshots.js`
- Le mount dans `server/index.js`
- Le sub-tab Settings frontend

Aucune migration DB nécessaire (la table `collab_snapshots` existe déjà avec tous les champs).

---

## 8. RISQUES IDENTIFIÉS NON COUVERTS PAR LE PLAN

### 8.1 ⚠ Test L2 envelope flow mal placé
`services/collabSnapshots/test-l2-envelope-flow.js` (168 lignes) concerne `lead_envelopes` et n'a rien à voir avec les snapshots. À déplacer / archiver lors de R6.

### 8.2 ⚠ Snapshots n'incluent PAS les fichiers `/storage/`
Les uploads contact (PDF, images) sont dans `/var/www/planora-data/storage/<companyId>/`. Le snapshot capture les **métadonnées** (`contact_documents`) mais **pas les fichiers binaires**. Si un fichier est supprimé, la restore restaurera le row `contact_documents` mais **pas le fichier**. À documenter explicitement dans RESTORE-COLLAB.md.

### 8.3 ⚠ Snapshots historiques (49 existants) peuvent être schema-mismatch
Si on ajoute une colonne à `contacts` après les premiers snapshots, le restore d'un vieux snapshot ne couvre pas la nouvelle colonne. Le code restore doit gérer (default values pour colonnes manquantes du payload). Stratégie : champ `payloadVersion` à la racine du JSON, code de migration upward.

### 8.4 ⚠ Aucun test de charge sur les très gros snapshots
Le snapshot le plus gros vu : 31KB pour 290 rows (Jordan / monbilan). Pas testé sur 10K+ rows. La retention LIMIT 500/2000 protège, mais à valider avant prod.

### 8.5 ⚠ Pas de notif user "il y a 7 jours sans snapshot"
Si un collab est inactif, son flag dirty ne se set jamais → 0 snapshot. Le système est sain (pas de bruit) mais l'utilisateur peut se croire protégé alors qu'il n'a pas de point de restauration récent. → recommandation : badge "dernier snapshot il y a X jours" visible dans header.

---

## 9. RECOMMANDATIONS FINALES

### À approuver MH avant Phase R1
1. ✅ **Confirme le scope** des 17+4 tables (validé S1, à re-valider rapidement)
2. ✅ **Confirme la politique retention** (20+24h+7j) — actuellement déjà active
3. ✅ **Décide de la portée user vs admin** : self-service collab + admin impersonation, ou interface admin séparée ? (reco : self-service uniforme)
4. ✅ **Décide du sort des snapshots schema-mismatch** : refus avec warning ? merge avec defaults ?
5. ✅ **Décide du périmètre UI V1** : juste liste + restore + preview, ou aussi diff visuel par contact ? (reco V1 minimal)

### Quick wins post-audit (si MH valide)
- 🔥 **R1+R2 ensemble** = backend prêt sous 2.5j → permet à l'admin de restore en CLI dès la fin de R2 (curl)
- 🔥 **Indicateur "dernier snapshot" visible** = même sans restore, donne confiance à l'utilisateur
- 🔥 **Snapshot manuel "avant import CSV"** = use-case direct (réduit risque corruption massive)

### Découpage shipping recommandé
- **V1.10.0-restore-engine** : R1 + R2 (backend complet, pas d'UI, manipulé par admin)
- **V1.10.1-restore-ui-self-service** : R3 + R4 (UI collab + reversibility)
- **V1.10.2-restore-warnings** : R5 (side-effects detection)
- **V1.10.3-docs-final** : R6

---

## 10. CONCLUSION

Le système de sauvegarde par collaborateur est **architecturalement complet et opérationnel à 80%** :
- Capture automatique fonctionnelle (49 snapshots prouvent le fonctionnement)
- Triggers DB intelligents (10 actifs)
- Cron auto + retention (cohérent avec la politique annoncée)
- Stockage sécurisé gzippé + intégrité SHA-256
- Périmètre finement défini (17 tables direct + 4 indirect, 16 OUT_OF_SCOPE documentées)

**Il manque uniquement la couche RESTORE** — engine + REST + UI. Phase finie en 6 jours-homme cumulés, livrable par sous-phases shippables.

**Aucune restructuration majeure nécessaire.** L'effort est concentré sur la lecture du snapshot et l'application contrôlée à la DB.

**Backup global V1.8.24** (DR infra GDrive+B2) **reste complémentaire** et non concerné par ce lot.

---

**Document d'audit READ-ONLY — Aucune modification code, DB, config, déploiement effectuée.**
**En attente décision MH sur §9 avant lancement Phase R1.**
