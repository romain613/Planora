# HANDOFF V1.12.6 — Refus actions critiques sur contacts archivés (option B)

> **Date** : 2026-05-01
> **Tag** : `v1.12.6-refuse-archived-actions`
> **Commit** : `48c772b2`
> **Statut** : ✅ déployé prod, tests SQL PASS, pattern 409 CONTACT_ARCHIVED uniforme
> **Prochaine étape** : V1.12.7 DELETE redéfini + hard delete + delete-preview **uniquement sur GO MH**

---

## 1. Résumé exécutif

Premier vrai **blocage UX** V1.12 : 8 endpoints structurels refusent désormais d'agir sur un contact archivé en retournant `409 CONTACT_ARCHIVED`. Pattern uniforme inline (pas de helper).

**4 fichiers patchés, 48 lignes ajoutées, 4 supprimées** (option B respectée — SMS/VoIP/Notifications/InteractionTemplates/InterMeetings/ContactDocuments laissés intacts).

---

## 2. Workflow strict 12 étapes — bilan

| # | Étape | Résultat |
|---:|---|:---:|
| 1 | TEST (audit READ-ONLY 12 endpoints, classification A/B/C) | ✅ |
| 2 | FIX (édit 4 fichiers /tmp) | ✅ 8 patches |
| 3 | re-TEST (`node --check` 4/4) | ✅ |
| 4 | **Diff exacte montrée à MH + GO option B explicite** | ✅ |
| 5 | DEPLOY (backup DB + 4 fichiers + SCP + PM2 restart) | ✅ PID 912243 |
| 6 | Healthcheck | ✅ status=ok |
| 7 | COMMIT local (`48c772b2`) | ✅ |
| 8 | PUSH origin/clean-main | ✅ |
| 9 | TAG `v1.12.6-refuse-archived-actions` + push | ✅ |
| 10 | BACKUP VPS post-checkpoint | ✅ |
| 11 | SECURITY check (md5 prod↔local pré-patch confirmés) | ✅ |
| 12 | HANDOFF doc + STOP | ✅ |

---

## 3. Patches détaillés — 8 endpoints

### bookings.js (1 patch)

| Ligne | Endpoint | Modification |
|---:|---|---|
| L92 | POST /api/bookings (contactId fourni) | + `archivedAt` dans SELECT existant + check 409 + console.warn |

### contactShare.js (2 patches + ERR_MAP)

| Ligne | Endpoint | Modification |
|---:|---|---|
| L36 | ERR_MAP global | + `CONTACT_ARCHIVED: 409` |
| L56 | POST /api/contact-share/send | NEW SELECT + check 409 (n'avait pas de SELECT inline) |
| L101 | POST /api/contact-share/desync/:contactId | NEW SELECT + check 409 |

### transfer.js (3 patches)

| Ligne | Endpoint | Modification |
|---:|---|---|
| L65 | PUT /api/transfer/executor/:contactId | + `archivedAt` dans SELECT existant + check 409 |
| L180 | POST /api/transfer/source/:contactId | NEW SELECT + check 409 |
| L214 | PUT /api/transfer/executor-stage/:contactId | NEW SELECT + check 409 |

### data.js (2 patches)

| Ligne | Endpoint | Modification |
|---:|---|---|
| L606 | PUT /api/data/contacts/:id | + `archivedAt` dans SELECT existant + check 409 (UI doit utiliser /:id/restore) |
| L805 | PUT /api/data/contacts/:id/share | + `archivedAt` dans SELECT existant + check 409 |

---

## 4. Format réponse 409 uniforme

```json
{
  "error": "CONTACT_ARCHIVED",
  "contactId": "<id>",
  "archivedAt": "<iso timestamp>"
}
```

Note : pour `PUT /data/contacts/:id` et `PUT /:id/share`, la réponse omet `contactId` (déjà dans l'URL).

---

## 5. Tests post-deploy

| Test | Résultat |
|---|:---:|
| Healthcheck `/api/health` | ✅ status=ok uptime 21s |
| Source prod count `CONTACT_ARCHIVED` bookings.js | 2 ✅ (1 error + 1 console.warn) |
| Source prod count `CONTACT_ARCHIVED` data.js | 2 ✅ (PUT /:id + PUT /:id/share) |
| Source prod count `CONTACT_ARCHIVED` transfer.js | 3 ✅ (executor + source + executor-stage) |
| Source prod count `CONTACT_ARCHIVED` contactShare.js | 3 ✅ (ERR_MAP + send + desync) |
| **Total occurrences** | **10** (cohérent avec 8 endpoints + 1 ERR_MAP + 1 console.warn) |
| T0 INSERT contact archivé `ct_v1126_arch` | ✅ archivedAt set |
| T1-T5 simulation SELECT prod | ✅ archivé identifiable par chaque pattern SELECT |
| Cleanup DELETE | ✅ 1 row |
| PRAGMA integrity_check | ok ✅ |
| PRAGMA foreign_key_check | 0 violation ✅ |

**Tests fonctionnels HTTP** : à valider en mode UI (V1.12.8 frontend), pour V1.12.6 mode dark/backend.

---

## 6. Comportement runtime après V1.12.6

### Actions BLOQUÉES sur contact archivé (8 surfaces)

| Surface | Réponse |
|---|:---:|
| POST /api/bookings (avec contactId archivé) | **409 CONTACT_ARCHIVED** |
| POST /api/contact-share/send (contactId archivé) | **409 CONTACT_ARCHIVED** |
| POST /api/contact-share/desync/:archived | **409 CONTACT_ARCHIVED** |
| PUT /api/transfer/executor/:archived | **409 CONTACT_ARCHIVED** |
| POST /api/transfer/source/:archived | **409 CONTACT_ARCHIVED** |
| PUT /api/transfer/executor-stage/:archived | **409 CONTACT_ARCHIVED** |
| PUT /api/data/contacts/:archived | **409 CONTACT_ARCHIVED** |
| PUT /api/data/contacts/:archived/share | **409 CONTACT_ARCHIVED** |

### Actions INCHANGÉES (option B respectée)

| Surface | Comportement |
|---|---|
| POST /api/data/contacts/:id/archive | inchangé (déjà 409 ALREADY_ARCHIVED si archivé) |
| POST /api/data/contacts/:id/restore | inchangé (action inverse) |
| GET endpoints (lecture) | filtres V1.12.5 actifs |
| DELETE /transfer/executor (cleanup retirer) | inchangé (cleanup OK) |
| DELETE /api/data/contacts/:id | inchangé (V1.12.7 redéfinira) |
| POST /api/sms/send | inchangé (option B) |
| POST /api/voip/call | inchangé (option B) |
| POST /api/inter-meetings/* | inchangé (option B, V1.12.6.x fixup possible) |
| POST /api/interaction-responses/* | inchangé (option B) |
| POST /api/contact-documents/* | inchangé (option B) |

### Actions SUR ACTIFS

Toutes les actions sur contacts actifs sont **inchangées** — V1.12.6 ne touche que la branche archivée.

---

## 7. Backups

| Quoi | Path VPS | md5 |
|---|---|---|
| DB pré-V1.12.6 | `/var/backups/planora/v1126-pre/calendar360.db.pre-v1126` | `12ba5c1a` |
| bookings.js pré | `bookings.js.pre-v1126` | `4df3535b` |
| data.js pré | `data.js.pre-v1126` | `9eb61a2e` |
| transfer.js pré | `transfer.js.pre-v1126` | `8e3fbb5b` |
| contactShare.js pré | `contactShare.js.pre-v1126` | `75a26df4` |
| DB post | `calendar360.db.post-v1126` | `12ba5c1a` (inchangée) |
| bookings.js post | `bookings.js` | `daa4e1f8` |
| data.js post | `data.js` | `7a2046f6` |
| transfer.js post | `transfer.js` | `343a4647` |
| contactShare.js post | `contactShare.js` | `c4e245c3` |
| Tarball post | `routes-v1126.tar.gz` | `cddc8ca4` |

---

## 8. État Git après V1.12.6

```
HEAD : 48c772b2 (V1.12.6 — Refus actions critiques sur contacts archivés)
Tags V1.12 (10) :
  v1.12.1-db-migration        v1.12.2-archive-endpoint
  v1.12.3-restore-endpoint    v1.12.4-archived-list
  v1.12.5a-filter-init        v1.12.5b-filter-duplicate
  v1.12.5c-filter-services    v1.12.5d-filter-bookings-dedup
  v1.12.5e-filter-nba         v1.12.6-refuse-archived-actions
Branch : clean-main → origin/clean-main aligned
```

---

## 9. Reste V1.12 (3 sous-phases ~10h dev)

- ⏭ **V1.12.7** DELETE redéfini + hard delete + delete-preview — 2h
- V1.12.8 frontend modale Archiver + onglet Archivés — 4h
- V1.12.9 frontend hard delete + bouton restore — 2h
- V1.12.10 tests régression (20 SQL + 10 UI) — 4h
- V1.12.11 HANDOFF + tag final `v1.12.0-archive-contacts` — 1h
- V1.12.12 cycle observation 1 semaine prod — passive
- V1.12.13 cleanup `pipeline_stage='perdu'` legacy V1.11.5 — 30 min

---

## 10. Reportable V1.12.6.x (option B → C transition future)

Si MH veut couvrir aussi (option C) :
- POST /api/interaction-responses/by-contact/:contactId
- POST /api/inter-meetings/followers
- POST /api/inter-meetings/book
- POST /api/contact-documents/:contactId/upload

Pattern identique (3-6 lignes par endpoint), 3 fichiers supplémentaires à patcher. Programmer V1.12.6.x si besoin.

---

## 11. STOP V1.12.6 confirmé — premier blocage UX V1.12 actif

**Aucune action sans GO MH explicite**.

Phase 6 entièrement clôturée. La couche backend est désormais "blindée" :
- Lecture (V1.12.5.a/b/c/d/e) : archivés invisibles dans les surfaces critiques
- Écriture/Action (V1.12.6) : archivés bloqués sur 8 endpoints structurels

V1.12.7 viendra redéfinir DELETE /:id en archive + ajouter le vrai hard delete avec garde-fou (admin only + preview).
