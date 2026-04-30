# HANDOFF V1.12.5.c — Filter VoIP + Conversations + ClientPortal

> **Date** : 2026-04-30
> **Tag** : `v1.12.5c-filter-services`
> **Commit** : `1a95055e`
> **Statut** : ✅ déployé prod, 10/10 tests SQL PASS
> **Prochaine étape** : V1.12.5.d filter bookings/reporting V1.11.4 **uniquement sur GO MH**

---

## 1. Résumé exécutif

6 SQL patchés sur 3 fichiers. Les contacts archivés n'apparaissent plus dans les lookups VoIP, ne sont plus auto-matchés en conversations SMS Hub, et ne peuvent plus accéder au ClientPortal.

**5 SQL ID-based enrichments NON touchés** = préservation historique (callLogs, conversations, notifications post-auth gardent les noms/phones).

---

## 2. Patch détaillé

### voip.js (2 SQL)

| Ligne | Endpoint | Modif |
|---:|---|---|
| L1170 | `GET /api/voip/lookup` admin/supra | + `AND (archivedAt IS NULL OR archivedAt = '')` |
| L1172 | `GET /api/voip/lookup` collab | + `AND (archivedAt IS NULL OR archivedAt = '')` |

### conversations.js (2 SQL)

| Ligne | Fonction | Modif |
|---:|---|---|
| L33 | `getOrCreateConversation` (auto-match phone) | + `AND (archivedAt IS NULL OR archivedAt = '')` |
| L158 | `GET /api/conversations` (search subquery) | subquery `WHERE name LIKE ? AND (archivedAt ...)` |

### clientPortal.js (2 SQL)

| Ligne | Endpoint | Modif |
|---:|---|---|
| L15 | `GET /api/espace/:token` (JOIN c.) | + `AND (c.archivedAt IS NULL OR c.archivedAt = '')` |
| L102 | `POST /api/espace/:token/message` | + `AND (archivedAt IS NULL OR archivedAt = '')` |

**Vérification source prod** :
- voip.js : 2 occurrences `archivedAt IS NULL OR archivedAt`
- conversations.js : 2 occurrences
- clientPortal.js : 1 occurrence (JOIN form `c.archivedAt` n'est pas comptée par grep simple, mais bien patchée — voir T7)

---

## 3. ID-based enrichments NON touchés (5 SQL — décision architecturale)

| Fichier | Lignes | Pourquoi pas filtrer ? |
|---|---|---|
| voip.js | L136, L861, L1543 | callLog/audit/Twilio webhook enrichments — historique appel doit afficher nom même si contact archivé après |
| conversations.js | L171, L238, L279 | List/poll/single enrichments — conv déjà créée avec contactId connu, pas de découverte |
| clientPortal.js | L116 | Notification post-auth — déjà passé par L11-16 (filtre actif) |

→ Cohérent avec philosophie V1.12 (soft delete + traçabilité historique).

---

## 4. Workflow strict 12 étapes — bilan

| # | Étape | Résultat |
|---:|---|:---:|
| 1 | TEST (audit READ-ONLY 11 SQL cartographiés sur 3 fichiers) | ✅ |
| 2 | FIX (édit 3 fichiers /tmp) | ✅ 6 SQL modifiés |
| 3 | re-TEST (`node --check` 3/3) | ✅ |
| 4 | **Diff exacte montrée à MH + GO explicite** | ✅ "GO V1.12.5.c SCP" |
| 5 | DEPLOY (backup DB + 3 fichiers + SCP + PM2 restart) | ✅ PID 908644 |
| 6 | Healthcheck | ✅ |
| 7 | COMMIT local (`1a95055e`) | ✅ |
| 8 | PUSH origin/clean-main | ✅ |
| 9 | TAG `v1.12.5c-filter-services` + push | ✅ |
| 10 | BACKUP VPS post-checkpoint | ✅ |
| 11 | SECURITY check (subquery parens, JOIN alias) | ✅ |
| 12 | HANDOFF doc + STOP | ✅ |

---

## 5. Tests post-deploy — 10/10 PASS

Setup : 2 contacts test cap (1 archivé `ct_v1125c_arch` + 1 actif `ct_v1125c_actif`) avec phone + name + clientToken + clientPortalEnabled.

| # | Test | Cible | Attendu | Réel |
|---:|---|---|---|:---:|
| T1 | voip L1170 admin lookup phone arch | 0 | ✅ |
| T2 | voip L1170 admin lookup phone actif | 1 | ✅ |
| T3 | voip L1172 collab lookup phone arch | 0 | ✅ |
| T4 | conv L33 auto-match phone arch | 0 | ✅ |
| T5 | conv L158 search name arch | 0 | ✅ |
| T6 | conv L158 search name actif | 1 | ✅ |
| T7 | portal L15 token arch | 0 | ✅ |
| T8 | portal L15 token actif | 1 | ✅ |
| T9 | portal L102 message arch | 0 | ✅ |
| **T10** | **ID-based enrichment historique** (`SELECT name WHERE id = ct_v1125c_arch`) | nom lu | ✅ "V1125c Arch Test" |
| Cleanup | DELETE 2 contacts | 2 rows | ✅ |
| Healthcheck | `/api/health` | status=ok | ✅ uptime 30s |
| PRAGMA integrity_check | ok | ✅ |
| PRAGMA foreign_key_check | 0 violation | ✅ |

---

## 6. Comportement runtime après V1.12.5.c

| Scénario | Avant | Après |
|---|---|---|
| Appel entrant phone d'un archivé | "Nom du contact" affiché dans cockpit VoIP | "Contact non enregistré" |
| SMS reçu phone d'un archivé | Conv créée avec `contactId=archivé.id` | Conv créée avec `contactId=null` |
| Recherche SMS Hub par nom d'archivé | Conv affichée | Conv masquée (sauf via clientPhone match direct) |
| Client archivé tape son URL `/espace/<token>` | Espace ouvert avec ses RDV/messages | 404 "Espace introuvable" |
| Client archivé tente envoi message | Message créé en DB | 404 "Espace introuvable" |
| **Historique callLog d'un archivé** | Nom affiché (L136/L861) | **Nom affiché — préservé** ✅ |
| **Conversation existante avec contactId archivé** | Enrichie avec données contact | **Enrichie — préservé** ✅ (L171/L238/L279) |

---

## 7. Backups

| Quoi | Path VPS | md5 |
|---|---|---|
| DB pré-V1.12.5.c | `/var/backups/planora/v1125c-pre/calendar360.db.pre-v1125c` | `1541e755` |
| voip.js pré | `/var/backups/planora/v1125c-pre/voip.js.pre-v1125c` | `e7556db4` |
| conversations.js pré | `/var/backups/planora/v1125c-pre/conversations.js.pre-v1125c` | `5ea26150` |
| clientPortal.js pré | `/var/backups/planora/v1125c-pre/clientPortal.js.pre-v1125c` | `4627923e` |
| DB post-V1.12.5.c | `/var/backups/planora/v1125c-post/calendar360.db.post-v1125c` | `c4fbd718` |
| voip.js post | `/var/backups/planora/v1125c-post/voip.js.post-v1125c` | `0004faf9` |
| conversations.js post | `/var/backups/planora/v1125c-post/conversations.js.post-v1125c` | `fb2a67a6` |
| clientPortal.js post | `/var/backups/planora/v1125c-post/clientPortal.js.post-v1125c` | `4733f935` |
| Tarball 3 fichiers | `/var/backups/planora/v1125c-post/services-routes-v1125c.tar.gz` | `37d13500` |

---

## 8. État Git après V1.12.5.c

```
HEAD : 1a95055e (V1.12.5.c — Filter VoIP + Conv + ClientPortal)
Tags V1.12 : v1.12.1-db-migration, v1.12.2-archive-endpoint,
             v1.12.3-restore-endpoint, v1.12.4-archived-list,
             v1.12.5a-filter-init, v1.12.5b-filter-duplicate,
             v1.12.5c-filter-services
Branch : clean-main → origin/clean-main aligned
```

---

## 9. Reste V1.12 (6 sous-phases ~12h dev)

- ⏭ **V1.12.5.d** Filter bookings/reporting V1.11.4 (+JOIN contacts) — 30 min
- V1.12.5.e Filter nextBestAction (4 SQL) — 30 min
- V1.12.6 refus actions critiques (POST bookings/share/transfer) — 1h
- V1.12.7 DELETE redéfini + hard delete + delete-preview — 2h
- V1.12.8 frontend modale Archiver + onglet Archivés — 4h
- V1.12.9 frontend hard delete + bouton restore — 2h
- V1.12.10 tests régression (20 SQL + 10 UI) — 4h
- V1.12.11 HANDOFF + tag final `v1.12.0-archive-contacts` — 1h
- V1.12.12 cycle observation 1 semaine prod — passive
- V1.12.13 cleanup `pipeline_stage='perdu'` legacy V1.11.5 — 30 min

---

## 10. STOP V1.12.5.c confirmé

**Aucune action sans GO MH explicite**.

Surfaces filtrées V1.12.5.a/b/c : init payload + duplicate-check + voip + conversations + clientPortal. Reste : Reporting bookings (V1.12.5.d), NextBestAction (V1.12.5.e), refus actions critiques (V1.12.6), redefine DELETE (V1.12.7), frontend (V1.12.8/9).
