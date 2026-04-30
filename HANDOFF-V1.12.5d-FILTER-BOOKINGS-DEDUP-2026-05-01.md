# HANDOFF V1.12.5.d — Filter bookings auto-dedup (Reporting préservé)

> **Date** : 2026-05-01
> **Tag** : `v1.12.5d-filter-bookings-dedup`
> **Commit** : `08f9a185`
> **Statut** : ✅ déployé prod, 9/9 tests SQL PASS
> **Prochaine étape** : V1.12.5.e filter nextBestAction (4 SQL) **uniquement sur GO MH**

---

## 1. Résumé exécutif

Étape sensible V1.12 (impact agenda + reporting) traitée avec **stratégie nuancée** :
- ✅ Filtré : 2 SQL auto-dedup (L127 email + L133 phone) lors création RDV
- ❌ Préservé : Reporting V1.11.4 (L538-545) intact = historique + capacité reporting receiver
- ❌ Préservé : 5 SQL enrichments ID-based payload (cohérent V1.12.5.c)
- ❌ Préservé : validation contactId L92-95 (V1.12.6 ajoutera 409)
- ❌ Préservé : Agenda affichage (lecture pure bookings sans JOIN contacts)

**2 lignes modifiées dans `bookings.js`, 0 ajoutée, 0 supprimée.**

---

## 2. Workflow strict 12 étapes — bilan

| # | Étape | Résultat |
|---:|---|:---:|
| 1 | TEST (audit READ-ONLY 9 SELECT contacts cartographiés en A/B/C) | ✅ |
| 2 | FIX (édit `/tmp/bookings-v1125d-patched.js`) | ✅ 2 SQL |
| 3 | re-TEST (`node --check`) | ✅ |
| 4 | **Diff exacte montrée à MH + GO option recommandée** | ✅ "GO V1.12.5.d SCP" |
| 5 | DEPLOY (backup DB + bookings.js + SCP + PM2 restart) | ✅ PID 910335 |
| 6 | Healthcheck | ✅ status=ok |
| 7 | COMMIT local (`08f9a185`) | ✅ |
| 8 | PUSH origin/clean-main | ✅ |
| 9 | TAG `v1.12.5d-filter-bookings-dedup` + push | ✅ |
| 10 | BACKUP VPS post-checkpoint | ✅ |
| 11 | SECURITY check (Reporting + agenda + enrichments préservés) | ✅ |
| 12 | HANDOFF doc + STOP | ✅ |

---

## 3. Patch détaillé

### Lignes modifiées

| Ligne | Endpoint | Modification |
|---:|---|---|
| L127 | POST /bookings auto-dedup email | + `AND (archivedAt IS NULL OR archivedAt = '')` |
| L133 | POST /bookings auto-dedup phone | + `AND (archivedAt IS NULL OR archivedAt = '')` |

### Vérification source prod
`grep -c 'archivedAt IS NULL OR archivedAt' bookings.js` → **4 occurrences** (2 V1.12.5.d + 2 pré-existantes V1.10.0/V1.10.1 collaborator archive check L84/L288).

---

## 4. Ce qui N'a PAS été touché (décisions architecturales)

| Élément | Pourquoi |
|---|---|
| **Reporting V1.11.4 (L538-545)** | Mix lecture historique + action receiver. Filtrer = perte double (historique + capacité reporting). Préservation = bonne UX rétroactive. |
| **Validation contactId L92-95** | Sera traité explicitement V1.12.6 avec 409 CONTACT_ARCHIVED. Pas de filter aveugle. |
| **5 SQL enrichments ID-based** (L248 / L306 / L441 / L503 / L656) | Payload retour create/update/cancel/report. Cohérent V1.12.5.c (préservation historique). |
| **Agenda affichage RDV** | Lecture pure `bookings`, pas de JOIN contacts. Aucun risque de RDV qui disparaît. |

---

## 5. Tests post-deploy — 9/9 PASS

Setup : 2 contacts test cap (1 archivé `ct_v1125d_arch` + 1 actif `ct_v1125d_actif`) + 1 booking share_transfer lié à un contact archivé (`bk_v1125d_test`).

| # | Test | Cible | Attendu | Réel |
|---:|---|---|---|:---:|
| T1 | L127 dedup email arch | nb match | 0 | ✅ |
| T2 | L127 dedup email actif | nb match | 1 | ✅ |
| T3 | L133 dedup phone arch | nb match | 0 | ✅ |
| T4 | L133 dedup phone actif | nb match | 1 | ✅ |
| **T5** | **RÉGRESSION Reporting received** (booking archivé) | 1 row visible | ✅ |
| **T6** | **RÉGRESSION Reporting sent** (booking archivé) | 1 row visible | ✅ |
| T7 | Validation contactId arch (L92, V1.12.6 to-do) | 1 | ✅ (V1.12.6 ajoutera 409) |
| T8 | Enrichment ID-based "V1125d Arch" | nom lu | ✅ |
| **T9** | **RÉGRESSION agenda affichage** | 1 row visible | ✅ |
| Cleanup | 1 booking + 2 contacts | OK | ✅ |
| Healthcheck | `/api/health` | status=ok | ✅ uptime 12s |
| PRAGMA integrity_check | ok | ✅ |
| PRAGMA foreign_key_check | 0 violation | ✅ |

---

## 6. Comportement runtime après V1.12.5.d

| Scénario | Avant | Après |
|---|---|---|
| Visiteur prend RDV via formulaire public, email match archivé | RDV rattaché à archivé | **Nouveau contact créé** |
| Visiteur prend RDV, phone match archivé (≥9 chiffres) | RDV rattaché à archivé | **Nouveau contact créé** |
| Création RDV avec contactId archivé fourni explicitement | RDV créé | **Inchangé V1.12.5.d** (V1.12.6 ajoutera 409) |
| Reporting RDV reçu (Julie) sur booking lié archivé | RDV visible | **Inchangé** ✅ |
| Reporting RDV transmis (Thomas) sur booking lié archivé | RDV visible | **Inchangé** ✅ |
| Agenda Thomas affiche RDV avec contact archivé | RDV visible | **Inchangé** ✅ |
| Cancel booking avec contact archivé | Réponse enrichie | **Inchangé** ✅ |
| Report booking → notif "RDV de [nom contact]" | Nom affiché | **Inchangé** ✅ |

---

## 7. Backups

| Quoi | Path VPS | md5 |
|---|---|---|
| DB pré-V1.12.5.d | `/var/backups/planora/v1125d-pre/calendar360.db.pre-v1125d` | `d592bcc2` |
| bookings.js pré | `/var/backups/planora/v1125d-pre/bookings.js.pre-v1125d` | `dae6e3ac` |
| DB post-V1.12.5.d | `/var/backups/planora/v1125d-post/calendar360.db.post-v1125d` | `d592bcc2` (inchangée) |
| bookings.js post | `/var/backups/planora/v1125d-post/bookings.js.post-v1125d` | `4df3535b` |
| Tarball post | `/var/backups/planora/v1125d-post/bookings-routes-v1125d.tar.gz` | `2110c2ab` |

---

## 8. État Git après V1.12.5.d

```
HEAD : 08f9a185 (V1.12.5.d — Filter bookings.js auto-dedup)
Tags V1.12 : v1.12.1-db-migration, v1.12.2-archive-endpoint,
             v1.12.3-restore-endpoint, v1.12.4-archived-list,
             v1.12.5a-filter-init, v1.12.5b-filter-duplicate,
             v1.12.5c-filter-services, v1.12.5d-filter-bookings-dedup
Branch : clean-main → origin/clean-main aligned
```

---

## 9. Reste V1.12 (5 sous-phases ~12h dev)

- ⏭ **V1.12.5.e** Filter nextBestAction (4 SQL) — 30 min
- V1.12.6 refus actions critiques (POST bookings/share/transfer 409 CONTACT_ARCHIVED) — 1h
- V1.12.7 DELETE redéfini + hard delete + delete-preview — 2h
- V1.12.8 frontend modale Archiver + onglet Archivés — 4h
- V1.12.9 frontend hard delete + bouton restore — 2h
- V1.12.10 tests régression (20 SQL + 10 UI) — 4h
- V1.12.11 HANDOFF + tag final `v1.12.0-archive-contacts` — 1h
- V1.12.12 cycle observation 1 semaine prod — passive
- V1.12.13 cleanup `pipeline_stage='perdu'` legacy V1.11.5 — 30 min

---

## 10. STOP V1.12.5.d confirmé

**Aucune action sans GO MH explicite**.

Étape sensible passée. Reporting V1.11.4 et Agenda 100% préservés. Prochaine étape V1.12.5.e = NextBestAction (dashboard collab dynamic actions, 4 SQL pure SELECT — risque faible).
