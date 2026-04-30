# HANDOFF V1.12.1 — Migration DB additive (Archive contacts)

> **Date** : 2026-04-30
> **Tag** : `v1.12.1-db-migration`
> **Commit** : `d5291e78`
> **Statut** : ✅ déployé prod, 6/6 vérifications PASS
> **Prochaine étape** : V1.12.2 POST `/:id/archive` endpoint **uniquement sur GO MH**

---

## 1. Résumé exécutif

Phase 1 V1.12 archive contacts livrée — **migration purement structurelle, additive, idempotente**.

3 nouvelles colonnes (`archivedAt`, `archivedBy`, `archivedReason`) + 1 nouvel index (`idx_contacts_active`) ajoutés à la table `contacts`. Aucun changement runtime, UI, reporting. Base pour V1.12.2+ (endpoints) et V1.12.5.x (filtres exclusion).

**486 contacts existants tous actifs (`archivedAt = ''` default), aucun n'a été modifié.**

---

## 2. Workflow strict 12 étapes — bilan

| # | Étape | Résultat |
|---:|---|:---:|
| 1 | TEST (audit READ-ONLY préalable) | ✅ AUDIT-V1.12-DEEP + RAPPORT-V1.12 |
| 2 | FIX (édit `/tmp/database-patched.js`) | ✅ 8 lignes ajoutées après ligne 325 |
| 3 | re-TEST (`node --check`) | ✅ syntax OK |
| 4 | **Diff exacte montrée à MH + GO explicite** | ✅ "GO V1.12.1 SCP" reçu |
| 5 | DEPLOY (backup DB + SCP + PM2 restart) | ✅ |
| 6 | Healthcheck (uptime, integrity, FK) | ✅ status=ok PID 893937 |
| 7 | COMMIT local (`d5291e78`) | ✅ |
| 8 | PUSH origin/clean-main | ✅ |
| 9 | TAG `v1.12.1-db-migration` + push | ✅ |
| 10 | BACKUP VPS post-checkpoint complet | ✅ |
| 11 | SECURITY check (companyId strict, idempotent) | ✅ |
| 12 | HANDOFF doc + STOP | ✅ ce doc |

---

## 3. Diff exacte appliquée

**Fichier** : `server/db/database.js`
**Position** : juste après ligne 325 (après `idx_contacts_assigned`)
**Type** : 100% additif — 8 lignes ajoutées (3 commentaires + 4 instructions DDL idempotentes), 0 ligne supprimée

```diff
@@ ligne 325 @@
 try { db.exec("CREATE INDEX IF NOT EXISTS idx_contacts_assigned ON contacts (assignedTo)"); } catch {}
+
+// V1.12.1 — Archive 3 etats (Actif / Archive / Efface). Migration additive idempotente.
+// archivedAt = '' -> contact actif. archivedAt != '' (ISO timestamp) -> archive.
+// Filter strict applique dans tous les SELECT/POST critiques en V1.12.5.x.
+try { db.exec("ALTER TABLE contacts ADD COLUMN archivedAt TEXT DEFAULT ''"); } catch {}
+try { db.exec("ALTER TABLE contacts ADD COLUMN archivedBy TEXT DEFAULT ''"); } catch {}
+try { db.exec("ALTER TABLE contacts ADD COLUMN archivedReason TEXT DEFAULT ''"); } catch {}
+try { db.exec("CREATE INDEX IF NOT EXISTS idx_contacts_active ON contacts(companyId, archivedAt)"); } catch {}

 // Timezone support
```

**Pattern aligné avec 60+ migrations historiques existantes (`try { db.exec(...) } catch {}`).**

### Checksums

| Étape | md5 |
|---|---|
| `database.js` pre-patch | `6ad40d0b85b9a223bb974898a6d582d7` |
| `database.js` post-patch (deployed) | `67ce4a6d8c2baa3dccbbf214cc56f8b3` |

---

## 4. Vérifications post-migration — 6/6 PASS

### 4.1 PRAGMA table_info(contacts)
```
77|archivedAt|TEXT|0|''|0       (NEW ✅)
78|archivedBy|TEXT|0|''|0       (NEW ✅)
79|archivedReason|TEXT|0|''|0   (NEW ✅)
```
**Total : 80 colonnes** (77 pre + 3). ✅

### 4.2 PRAGMA index_list(contacts)
```
0|idx_contacts_active|0|c|0     (NEW ✅, slot 0)
1-19 : 19 index existants conservés ✅
20  : sqlite_autoindex_contacts_1 (PK) ✅
```

### 4.3 PRAGMA integrity_check
`ok` ✅

### 4.4 PRAGMA foreign_key_check
(empty) — 0 violation ✅

### 4.5 Healthcheck post-restart
```
{"status":"ok","db":"connected","companies":6,"collaborateurs":16,
 "dbPath":"/var/www/planora-data/calendar360.db","uptime":20}
PM2 PID 893937, online, 149 Mo
```
✅

### 4.6 Sample COUNT preservation
| Métrique | Pre | Post | Verdict |
|---|---:|---:|:---:|
| `COUNT(*) FROM contacts` (ALL) | 486 | 486 | ✅ inchangé |
| `COUNT(*) WHERE companyId='c1776169036725'` (DRH) | 184 | 184 | ✅ inchangé |
| `COUNT(*) WHERE archivedAt = ''` (tous actifs default) | N/A | 486 | ✅ tous actifs |

---

## 5. Backups disponibles

| Étape | Fichier | md5 | Taille |
|---|---|---|---|
| **Pre-migration** | `/var/backups/planora/v1121-pre-migration/calendar360.db.pre-v1121-20260430-152410` | `b6f0c79d9631c1e9556a1022645f42d9` | 7.59 Mo |
| Post-migration (pre-checkpoint) | `/var/backups/planora/v1121-pre-migration/calendar360.db.post-v1121-20260430-152608` | `b6f0c79d9631c1e9556a1022645f42d9` (= pre — WAL non checkpointed) | 7.59 Mo |
| **Post-checkpoint COMPLET** | `/var/backups/planora/v1121-post-complete/calendar360.db.post-v1121-checkpoint-20260430-152641` | `9041fb92f1191ccb59238206f233764c` | 7.61 Mo |
| Post-checkpoint WAL | `/var/backups/planora/v1121-post-complete/calendar360.db-wal...` | `d41d8cd9...` (empty file = checkpoint flushed) | 0 |
| Post-checkpoint SHM | `/var/backups/planora/v1121-post-complete/calendar360.db-shm...` | `1e59b69f...` | 32 Ko |
| Tarball database.js patched | `/var/backups/planora/v1121-postmigration-20260430-152608.tar.gz` | `33da559b1e02f31a9c8f7af01763f438` | 20 Ko |

### Note WAL checkpoint
Avant checkpoint, le main `.db` avait md5 identique au pre-migration (les ALTER étaient en WAL). `PRAGMA wal_checkpoint(TRUNCATE)` a forcé le flush. Backup post-checkpoint = état runtime fidèle. **Le rollback complet doit utiliser le pre-migration `.db` (md5 b6f0c79d).**

### Procédure rollback (si nécessaire)

```bash
# Rollback DB
ssh root@VPS "cp /var/backups/planora/v1121-pre-migration/calendar360.db.pre-v1121-20260430-152410 /var/www/planora-data/calendar360.db && pm2 restart calendar360"

# Rollback code (database.js patché → pre-patch)
git revert d5291e78  # local
git push origin clean-main  # ⚠ après validation MH
# Puis SCP database.js pre-patch vers VPS + PM2 restart
```

⚠ Rollback peu probable — ALTER ADD COLUMN est non-destructif. Aucune row contacts n'a été modifiée.

---

## 6. État Git final

```
d5291e78 (HEAD -> clean-main, origin/clean-main, tag: v1.12.1-db-migration)
         V1.12.1 — Migration DB additive : archivedAt + archivedBy + archivedReason + index
68723f6d docs(handoff): Phase 0ter Lot 1 handoff complet (13 sections)
ad2cbfd6 (tag: phase-0ter-lot1-done)
         chore(server): Phase 0ter Lot 1 — rapatrier middleware + 34 routes critiques V1.12
```

Branch : `clean-main`
HEAD : `d5291e78`
Tag local + distant : `v1.12.1-db-migration` ✅

---

## 7. Anti-régression — aucun impact runtime

| Module | État pré V1.12.1 | État post V1.12.1 |
|---|:---:|:---:|
| Pipeline Live (drag/drop, badges) | ✅ OK | ✅ inchangé |
| CRM list / fiche | ✅ OK | ✅ inchangé |
| Reporting RDV V1.11.4 | ✅ OK | ✅ inchangé |
| Contact Share V1 | ✅ OK | ✅ inchangé |
| duplicate-check V1.11.5 (filter `pipeline_stage='perdu'`) | ✅ OK | ✅ inchangé |
| Lead V1.10.6 envelope | ✅ OK | ✅ inchangé |
| SMS Hub V1.10.2 | ✅ OK | ✅ inchangé |
| Quick add V1.8.22 | ✅ OK | ✅ inchangé |
| Import CSV V1.10.5 | ✅ OK | ✅ inchangé |
| VoIP token + lookup V1.11.4 | ✅ OK | ✅ inchangé |

**Cause** : V1.12.1 = pure migration structurelle. Aucune route, aucune query, aucun composant React n'a été modifié. Les 17 SELECT FROM contacts existants ne référencent pas `archivedAt` → continuent identiquement.

---

## 8. Reste V1.12 — 12 sous-phases en attente GO MH

| # | Phase | Effort | État |
|---:|---|---|:---:|
| **V1.12.1** | DB migration | 30 min | ✅ DONE |
| V1.12.2 | POST /:id/archive endpoint | 1h | ⏸ GO requis |
| V1.12.3 | POST /:id/restore endpoint | 30 min | ⏸ |
| V1.12.4 | GET /contacts/archived list | 45 min | ⏸ |
| V1.12.5.a | Filter init.js | 30 min | ⏸ |
| V1.12.5.b | Filter data.js duplicate-check | 30 min | ⏸ |
| V1.12.5.c | Filter voip + conversations + clientPortal | 1h | ⏸ |
| V1.12.5.d | Filter bookings/reporting (V1.11.4) | 30 min | ⏸ |
| V1.12.5.e | Filter nextBestAction | 30 min | ⏸ |
| V1.12.6 | Refus actions critiques | 1h | ⏸ |
| V1.12.7 | DELETE redéfini = archive | 2h | ⏸ |
| V1.12.8 | Frontend modale + onglet | 4h | ⏸ |
| V1.12.9 | Frontend hard delete UI | 2h | ⏸ |
| V1.12.10 | Tests régression | 4h | ⏸ |
| V1.12.11 | HANDOFF + tag final | 1h | ⏸ |

**Reste estimé : ~19h dev** (sur GO MH étape par étape).

---

## 9. Reprise nouvelle session

1. Lire MEMORY.md (auto-loaded)
2. Lire ce HANDOFF en priorité
3. Repo HEAD `d5291e78`, prod stable, DB migrée
4. Décisions Q1-Q9 validées (recos par défaut)
5. Sur GO MH : démarrer V1.12.2 (POST /:id/archive) avec workflow strict (diff montrée AVANT SCP)

---

## 10. Sources & docs liés

- [RAPPORT-V1.12-AUDIT-2026-04-30.md](RAPPORT-V1.12-AUDIT-2026-04-30.md) — rapport audit consolidé
- [AUDIT-V1.12-DEEP-2026-04-30.md](AUDIT-V1.12-DEEP-2026-04-30.md) — cartographie technique exhaustive
- [PLAN-V1.12-EXECUTION-DETAILLE-2026-04-30.md](PLAN-V1.12-EXECUTION-DETAILLE-2026-04-30.md) — plan détaillé
- [HANDOFF V1.11.5](HANDOFF-V1.11.5-DUPLICATE-PERDU-FIX.md) — duplicate filter perdu (legacy)
- [HANDOFF V1.11.4](HANDOFF-V1.11.4-REPORTING-RDV-FIX.md) — Reporting bookings.js (à patcher V1.12.5.d)
- [HANDOFF Phase 0ter Lot 1](HANDOFF-PHASE-0ter-LOT-1-2026-04-30.md) — repo aligné prod

---

**V1.12.1 clôturée. Migration DB additive validée 6/6. Aucun impact runtime. STOP — en attente GO MH pour V1.12.2.**
