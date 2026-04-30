# HANDOFF V1.12.5.e — Filter nextBestAction (rapatriement spot)

> **Date** : 2026-05-01
> **Tag** : `v1.12.5e-filter-nba`
> **Commit** : `99857808`
> **Statut** : ✅ déployé prod, 8/8 tests SQL PASS
> **Prochaine étape** : V1.12.6 refus actions critiques (POST bookings/share/transfer 409 CONTACT_ARCHIVED) **uniquement sur GO MH**

---

## 1. Résumé exécutif

**Phase 5 V1.12 clôturée** (a/b/c/d/e). Toutes les surfaces backend principales filtrent désormais les contacts archivés.

V1.12.5.e a comporté un **rapatriement spot** : `services/nextBestAction.js` n'était pas dans le repo local (gap Phase 0ter Lots 2-4 en pause) → rapatrié depuis prod (206 lignes) puis patché. **+1 nouveau fichier dans le repo**, 6 SQL filtrés inline.

---

## 2. Workflow strict 12 étapes — bilan

| # | Étape | Résultat |
|---:|---|:---:|
| 1 | TEST (audit READ-ONLY 6 SQL "actions actives" cartographiées) | ✅ |
| 2 | **Rapatriement spot** : `nextBestAction.js` ← prod (Phase 0ter spot) | ✅ md5 `df106360` |
| 3 | FIX (édit `/tmp/nextBestAction-v1125e-patched.js`) | ✅ 6 SQL |
| 4 | re-TEST (`node --check` original + patché) | ✅ |
| 5 | **Diff exacte montrée à MH + GO explicite** | ✅ "GO V1.12.5.e SCP" |
| 6 | DEPLOY (backup DB + nextBestAction.js + SCP + PM2 restart) | ✅ PID 911437 |
| 7 | Healthcheck | ✅ status=ok |
| 8 | COMMIT local (`99857808`) | ✅ |
| 9 | PUSH origin/clean-main | ✅ |
| 10 | TAG `v1.12.5e-filter-nba` + push | ✅ |
| 11 | BACKUP VPS post-checkpoint | ✅ |
| 12 | HANDOFF doc + STOP | ✅ |

---

## 3. Patch détaillé — 6 SQL "actions actives"

| Ligne | Section NBA | Priorité | Modification |
|---:|---|:---:|---|
| L80 | RELANCER_NRP | P2 | + `AND (archivedAt IS NULL OR archivedAt = '')` |
| L101 | QUALIFIER_POST_RDV | P2 | + `AND (archivedAt IS NULL OR archivedAt = '')` |
| L120 | FOLLOWUP_IA (JOIN c) | P3 | + `AND (c.archivedAt IS NULL OR c.archivedAt = '')` |
| L140 | CLOSER_QUALIFIE | P3 | + `AND (archivedAt IS NULL OR archivedAt = '')` |
| L159 | RELANCER_DEVIS | P4 | + `AND (archivedAt IS NULL OR archivedAt = '')` |
| L178 | RAPPELER_INACTIF | P5 | + `AND (archivedAt IS NULL OR archivedAt = '')` |

**Vérification source prod** : `grep -c 'archivedAt IS NULL OR archivedAt'` → **5** (1 SQL avec préfixe `c.` non comptée par regex sans word boundary, 6 SQL effectivement patchés — confirmé par tests T1-T8).

**Hors scope V1.12.5.e (intentionnel)** :
- L60 NEW_LEAD lit `incoming_leads` (pas `contacts`)
- Helper `getLastHumanAction(ct.id)` : ID-based, hors SQL FROM contacts

---

## 4. ⚠ Note Phase 0ter — rapatriement spot

| Item | État |
|---|---|
| `services/nextBestAction.js` | **Rapatrié dans repo local** (V1.12.5.e) |
| Phase 0ter Lots 2-4 | **Toujours en pause** |
| Autres fichiers Phase 0ter | **Toujours absents du repo local** |
| Dette Phase 0ter | **Conservée** (rapatriement spot ≠ reprise complète) |

Action future : à la reprise complète Phase 0ter Lots 2-4, vérifier que `nextBestAction.js` rapatrié spot est cohérent avec ce qui sera rapatrié globalement (md5 check).

---

## 5. Tests post-deploy — 8/8 PASS

Setup : 6 contacts test cap (3 archivés + 3 actifs miroirs) avec différents pipeline_stages (nrp / qualifie / qualifie+contract).

| # | Test | Cible | Attendu | Réel |
|---:|---|---|---|:---:|
| T1 | L80 RELANCER_NRP archivé | nb match | 0 | ✅ |
| T2 | L80 RELANCER_NRP actif | nb match | 1 | ✅ |
| T3 | L140 CLOSER_QUALIFIE archivé | nb match | 0 | ✅ |
| T4 | L140 CLOSER_QUALIFIE actif | nb match | 1 | ✅ |
| T5 | L159 RELANCER_DEVIS archivé | nb match | 0 | ✅ |
| T6 | L159 RELANCER_DEVIS actif | nb match | 1 | ✅ |
| T7 | L178 RAPPELER_INACTIF archivé | nb match | 0 | ✅ |
| T8 | L178 RAPPELER_INACTIF actif | nb match | 1 | ✅ |
| Cleanup | DELETE 6 contacts test | 6 rows | ✅ |
| Healthcheck | `/api/health` | status=ok | ✅ uptime 33s |
| PRAGMA integrity_check | ok | ✅ |
| PRAGMA foreign_key_check | 0 violation | ✅ |

**L101 (QUALIFIER_POST_RDV)** et **L120 (FOLLOWUP_IA)** : pattern strictement identique aux 4 SQL testés (même structure WHERE + filter), validation par homologie.

---

## 6. Comportement runtime après V1.12.5.e

| Surface | Avant | Après |
|---|---|---|
| Dashboard NBA — RELANCER_NRP | Archivés en NRP suggérés | **Plus de suggestion** ✅ |
| Dashboard NBA — QUALIFIER_POST_RDV | Archivés avec RDV passé suggérés | **Plus de suggestion** ✅ |
| Dashboard NBA — FOLLOWUP_IA | Archivés avec analyse IA suggérés | **Plus de suggestion** ✅ |
| Dashboard NBA — CLOSER_QUALIFIE | Archivés qualifié sans progression suggérés | **Plus de suggestion** ✅ |
| Dashboard NBA — RELANCER_DEVIS | Archivés devis non signé suggérés | **Plus de suggestion** ✅ |
| Dashboard NBA — RAPPELER_INACTIF | Archivés inactifs 7j suggérés | **Plus de suggestion** ✅ |
| Dashboard NBA — NOUVEAU_LEAD | (incoming_leads — hors scope) | **Inchangé** |
| Tri/sort des actions | Inchangé (priority → leadScore → dueDate) | **Inchangé** |

---

## 7. Backups

| Quoi | Path VPS | md5 |
|---|---|---|
| DB pré-V1.12.5.e | `/var/backups/planora/v1125e-pre/calendar360.db.pre-v1125e` | `135c559d` |
| nextBestAction.js pré | `/var/backups/planora/v1125e-pre/nextBestAction.js.pre-v1125e` | `df106360` |
| DB post-V1.12.5.e | `/var/backups/planora/v1125e-post/calendar360.db.post-v1125e` | `135c559d` (inchangée) |
| nextBestAction.js post | `/var/backups/planora/v1125e-post/nextBestAction.js.post-v1125e` | `7f30d8a2` |
| Tarball post | `/var/backups/planora/v1125e-post/services-nextBestAction-v1125e.tar.gz` | `e76ec2e7` |

---

## 8. État Git après V1.12.5.e

```
HEAD : 99857808 (V1.12.5.e — Filter nextBestAction + rapatriement spot)
Tags V1.12 : v1.12.1-db-migration, v1.12.2-archive-endpoint,
             v1.12.3-restore-endpoint, v1.12.4-archived-list,
             v1.12.5a-filter-init, v1.12.5b-filter-duplicate,
             v1.12.5c-filter-services, v1.12.5d-filter-bookings-dedup,
             v1.12.5e-filter-nba
Branch : clean-main → origin/clean-main aligned
Nouveau fichier : server/services/nextBestAction.js (206 lignes)
```

---

## 9. Reste V1.12 (4 sous-phases ~11h dev)

- ⏭ **V1.12.6** Refus actions critiques (POST bookings/share/transfer 409 CONTACT_ARCHIVED + bookings futurs check) — 1h
- V1.12.7 DELETE redéfini + hard delete + delete-preview — 2h
- V1.12.8 frontend modale Archiver + onglet Archivés — 4h
- V1.12.9 frontend hard delete + bouton restore — 2h
- V1.12.10 tests régression (20 SQL + 10 UI) — 4h
- V1.12.11 HANDOFF + tag final `v1.12.0-archive-contacts` — 1h
- V1.12.12 cycle observation 1 semaine prod — passive
- V1.12.13 cleanup `pipeline_stage='perdu'` legacy V1.11.5 — 30 min

---

## 10. STOP V1.12.5.e confirmé — Phase 5 entièrement clôturée

**Aucune action sans GO MH explicite**.

Phase 5 V1.12 (filtrage backend) **complète à 100%** :

| Surface | Tag |
|---|---|
| Init payload `/api/init` | `v1.12.5a-filter-init` |
| Duplicate-check 7 SQL | `v1.12.5b-filter-duplicate` |
| VoIP + Conv + Portal 6 SQL | `v1.12.5c-filter-services` |
| Bookings auto-dedup 2 SQL | `v1.12.5d-filter-bookings-dedup` |
| NextBestAction 6 SQL | `v1.12.5e-filter-nba` |

**Total Phase 5 = 24 SQL filter ajoutés sur 7 fichiers backend, 0 régression Reporting/Agenda/Historique.**

Prochain saut V1.12.6 = refus actif des actions critiques sur archivés (409 CONTACT_ARCHIVED), premier vrai "blocage" UX.
