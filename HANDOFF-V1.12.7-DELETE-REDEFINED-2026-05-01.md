# HANDOFF V1.12.7 — DELETE redéfini + hard delete + delete-preview

> **Date** : 2026-05-01
> **Tag** : `v1.12.7-delete-redefined`
> **Commit** : `845f348b`
> **Statut** : ✅ déployé prod, tests SQL PASS, backend Phase 7 clôturée
> **Prochaine étape** : V1.12.8 frontend modale Archiver + onglet Archivés **uniquement sur GO MH**

---

## 1. Résumé exécutif

**Phase 7 V1.12 clôturée** = backend complet pour la suppression contact (3 états : actif → archivé → hard deleted). 4 endpoints redéfinis/ajoutés dans `data.js`.

**1 fichier patché, 192 lignes ajoutées, 36 supprimées.**

---

## 2. Workflow strict 12 étapes — bilan

| # | Étape | Résultat |
|---:|---|:---:|
| 1 | TEST (audit READ-ONLY 18 tables linkées contactId, classification KEEP/DELETE) | ✅ |
| 2 | FIX (édit `/tmp/data-v1127-patched.js`) | ✅ 4 endpoints |
| 3 | re-TEST (`node --check`) | ✅ |
| 4 | **Diff exacte montrée à MH + GO explicite (Q1-Q7 validés)** | ✅ "GO V1.12.7 SCP" |
| 5 | DEPLOY (backup DB + data.js + SCP + PM2 restart) | ✅ PID 912957 |
| 6 | Healthcheck | ✅ status=ok |
| 7 | COMMIT local (`845f348b`) | ✅ |
| 8 | PUSH origin/clean-main | ✅ |
| 9 | TAG `v1.12.7-delete-redefined` + push | ✅ |
| 10 | BACKUP VPS post-checkpoint | ✅ |
| 11 | SECURITY check (triple verrou hard delete + cascade transaction) | ✅ |
| 12 | HANDOFF doc + STOP | ✅ |

---

## 3. 4 endpoints détaillés

### A. `DELETE /api/data/contacts/:id` (RÉÉCRITURE — alias archive)

| Aspect | Valeur |
|---|---|
| Comportement avant V1.12.7 | hard delete + cancel bookings auto |
| Comportement après | **alias archive** (UPDATE archivedAt) |
| Réponse 200 | `{success, action: 'archived', archivedAt, archivedBy, archivedReason}` |
| 409 si déjà archivé | `ALREADY_ARCHIVED` |
| Bookings | **INCHANGÉS** (V1.12.8 UI 2-step gérera) |

### B. `POST /api/data/contacts/bulk-delete` (RÉÉCRITURE)

| Body | Comportement |
|---|---|
| `{contactIds, mode: 'archive'}` (DEFAULT) | Archive batch, skip déjà archivés (idempotent) |
| `{contactIds, mode: 'permanent', confirm: 'CONFIRM_HARD_DELETE'}` | Hard delete batch (admin only + tous archivés) |

**Réponses** :
- mode='archive' : `{success, action: 'archived', archived, skipped, total}`
- mode='permanent' : `{success, action: 'hard_deleted', deleted, total}`
- 403 PERMISSION_DENIED si non admin/supra (mode permanent)
- 400 BODY_CONFIRMATION_REQUIRED si pas de confirm
- 409 NOT_ALL_ARCHIVED si certains pas archivés (avec liste IDs)

### C. `DELETE /api/data/contacts/:id/permanent` (NEW — hard delete strict)

**Triple verrou backend** :
1. `req.auth.isAdmin || req.auth.isSupra` → 403 PERMISSION_DENIED
2. `record.archivedAt set` → 409 NOT_ARCHIVED
3. `body.confirm === 'CONFIRM_HARD_DELETE'` → 400 BODY_CONFIRMATION_REQUIRED

**Cascade DELETE en transaction** :
```js
db.transaction(() => {
  db.prepare('DELETE FROM contact_followers WHERE contactId = ?').run(id);
  db.prepare('DELETE FROM recommended_actions WHERE contactId = ?').run(id);
  db.prepare('DELETE FROM contact_ai_memory WHERE contactId = ?').run(id);
  db.prepare('DELETE FROM contact_documents WHERE contactId = ?').run(id);
  db.prepare('DELETE FROM contacts WHERE id = ?').run(id);
});
```

**Réponse 200** :
```json
{
  "success": true,
  "action": "hard_deleted",
  "id": "...",
  "name": "...",
  "deletedFromTables": ["contact_followers", "recommended_actions", "contact_ai_memory", "contact_documents", "contacts"]
}
```

### D. `GET /api/data/contacts/:id/delete-preview` (NEW)

**Auth** : view permission + companyId match + ownership ou admin

**Réponse 200** :
```json
{
  "contactId": "...",
  "contactName": "...",
  "archived": true/false,
  "archivedAt": "<iso>" | "",
  "linkedCounts": {
    "bookings": 12,
    "call_logs": 45,
    ...
  },
  "willBeDeleted": ["contact_followers", "recommended_actions", "contact_ai_memory", "contact_documents", "contacts"],
  "willBePreserved": ["bookings", "call_logs", ..., "audit_logs"],
  "canHardDelete": true/false,
  "requiresAdmin": true/false,
  "requiresArchive": true/false
}
```

---

## 4. Tables impactées par hard delete (18 cartographiées)

### 🔴 DELETE (4 tables)

| Table | Raison |
|---|---|
| **contact_followers** | V7 transfer relations cassées |
| **recommended_actions** | NBA recommandations orphelines |
| **contact_ai_memory** | Mémoire IA lien cassé |
| **contact_documents** | Metadata docs (binaires disque cleanup → cron futur option C) |

### 🟢 KEEP (14 tables — historique audit préservé)

| Table | Raison |
|---|---|
| bookings | Historique RDV (snapshot visitorName/Email/Phone) |
| call_logs | Historique appels |
| call_contexts | Contexte cockpit appel |
| call_form_responses | Formulaires post-appel |
| call_transcript_archive | Archives transcripts (V1.9 transcript persistance) |
| sms_messages | Historique SMS |
| conversations | SMS Hub conversations |
| client_messages | Messages portail client |
| pipeline_history | Tracking stages |
| contact_status_history | Tracking statut |
| notifications | Notifs collab |
| interaction_responses | Réponses templates V1.11 |
| ai_copilot_analyses | Analyses IA historique |
| system_anomaly_logs | Logs système |
| audit_logs | (logging V1.12.7 lui-même) |

---

## 5. Tests post-deploy

| # | Test | Cible | Attendu | Réel |
|---:|---|---|---|:---:|
| Healthcheck | `/api/health` | status=ok | ✅ uptime 11s |
| Source prod | `grep V1.12.7` | 7 mentions | ✅ |
| 3 endpoints mounted | grep router.delete + router.get prod | 3 lignes | ✅ |
| T1 | DELETE /:id sur actif → archivedAt set | UPDATE 1 row | ✅ archivedAt='2026-05-01 13:00:00' |
| T2 | DELETE /:id sur déjà archivé | 0 changes (= 409 simulation) | ✅ |
| T3 | NOT_ARCHIVED check préventif | archivedAt='' | ✅ |
| **T5** | **Bookings PRÉSERVÉ après cascade hard delete** | id='bk_v1127' status='confirmed' | ✅ |
| T6 | contact_followers purgé | 0 | ✅ |
| T7 | contact purgé | 0 | ✅ |
| T8 | preview cnts (bookings/call_logs/followers) | 0 attendu (no setup) | ✅ |
| Cleanup | DELETE 1 booking | 1 row | ✅ |
| PRAGMA integrity_check | ok | ✅ |
| PRAGMA foreign_key_check | 0 violation | ✅ |

**Note tests fonctionnels HTTP** : à valider en V1.12.8 (frontend) + V1.12.10 (régression complète).

---

## 6. Comportement runtime — récap UX

| Scénario | Avant V1.12.7 | Après V1.12.7 |
|---|---|---|
| User clique "Supprimer" sur fiche contact | Hard delete + cancel bookings silent | **Contact archivé** (récupérable via /restore) |
| Bouton "Supprimer définitivement" (admin) | N/A | **DELETE /:id/permanent** avec triple verrou |
| Bulk delete sélection multi | Hard delete batch | **Archive batch** (default) |
| Admin hard delete batch | N/A | mode='permanent' + confirm + tous archivés |
| Bouton "Voir impact avant suppression" | N/A | **GET /:id/delete-preview** (UI V1.12.8/9) |
| Restore archivé (POST /:id/restore) | INCHANGÉ | INCHANGÉ ✅ |
| Bookings après hard delete contact | cancelled silent | **PRÉSERVÉS** (snapshot visitorName) |
| Reporting V1.11.4 | inchangé | **INCHANGÉ** ✅ |
| Agenda affichage | inchangé | **INCHANGÉ** ✅ |

---

## 7. Backups

| Quoi | Path VPS | md5 |
|---|---|---|
| DB pré-V1.12.7 | `/var/backups/planora/v1127-pre/calendar360.db.pre-v1127` | `9ebce909` |
| data.js pré | `/var/backups/planora/v1127-pre/data.js.pre-v1127` | `7a2046f6` |
| DB post-V1.12.7 | `/var/backups/planora/v1127-post/calendar360.db.post-v1127` | `9ebce909` (inchangée) |
| data.js post | `/var/backups/planora/v1127-post/data.js.post-v1127` | `cc12d872` |
| Tarball | `/var/backups/planora/v1127-post/data-routes-v1127.tar.gz` | `fce8e837` |

---

## 8. État Git après V1.12.7

```
HEAD : 845f348b (V1.12.7 — DELETE redéfini + hard delete admin-only + delete-preview)
Tags V1.12 (11) :
  v1.12.1-db-migration            v1.12.2-archive-endpoint
  v1.12.3-restore-endpoint        v1.12.4-archived-list
  v1.12.5a-filter-init            v1.12.5b-filter-duplicate
  v1.12.5c-filter-services        v1.12.5d-filter-bookings-dedup
  v1.12.5e-filter-nba             v1.12.6-refuse-archived-actions
  v1.12.7-delete-redefined        ← NEW
Branch : clean-main → origin/clean-main aligned
```

---

## 9. Reste V1.12 (3 sous-phases ~10h dev) — phase backend close

✅ Backend V1.12 entièrement terminé (Phases 1-7) :
- DB schema + 3 endpoints CRUD archive (V1.12.1-4)
- Filtres lecture 7 fichiers / 24 SQL (V1.12.5)
- Refus actions structurelles (V1.12.6)
- DELETE redéfini + hard delete + preview (V1.12.7)

Reste :
- ⏭ **V1.12.8** frontend modale Archiver + onglet Archivés (~4h)
- V1.12.9 frontend hard delete + bouton restore (~2h)
- V1.12.10 tests régression (20 SQL + 10 UI) — 4h
- V1.12.11 HANDOFF + tag final `v1.12.0-archive-contacts`
- V1.12.12 cycle observation 1 semaine prod
- V1.12.13 cleanup `pipeline_stage='perdu'` legacy V1.11.5

---

## 10. Reportable hors scope V1.12.7

🟡 **Cleanup binaires disque** (Q7 option C) : les rows `contact_documents` sont supprimées mais les binaires sur disque restent. Programmer un cron nightly qui vérifie l'orphelinage.

🟡 **Audit binaires existants** : les contacts déjà supprimés via le hard delete d'avant V1.12.7 ont laissé des rows orphelines dans contact_followers/recommended_actions/contact_ai_memory/contact_documents. Audit + cleanup batch à programmer.

---

## 11. STOP V1.12.7 confirmé — Backend Phase 7 close

**Aucune action sans GO MH explicite**.

Backend V1.12 complet et testé. **Prochain saut V1.12.8 = frontend** (modale Archiver UI + sous-onglet Archivés CrmTab + boutons "Restaurer"/"Supprimer définitivement"). Premier vrai impact UX visible côté users.
