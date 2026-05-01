# HANDOFF V1.12.x.2 — Reporting badge contact archivé + confirmation enrichie

> **Date** : 2026-05-01
> **Tag** : `v1.12.x.2-reporting-badge-archive`
> **Commit** : `a9e06eb3`
> **Statut** : ✅ déployé prod, 6 phases workflow strict respectées
> **Prochaine étape** : V1.12.9 frontend hard delete UI ou autre priorité MH

---

## 1. Résumé exécutif

Suite à V1.12.x.1 (Reporting clean ghost contacts), nouvelle UX pour les contacts archivés : **ne pas masquer** mais **signaler** avec un badge explicite "📦 Contact archivé". Confirmation d'archivage enrichie quand des RDV confirmés futurs sont liés.

**4 fichiers modifiés (1 backend + 3 frontend), 19 insertions / 4 suppressions. 0 régression V1.12.x.1.**

---

## 2. Workflow strict 12 étapes — bilan

| # | Étape | Résultat |
|---:|---|:---:|
| 1 | TEST audit READ-ONLY (4 zones cartographiées) | ✅ |
| 2 | FIX patch /tmp 4 fichiers | ✅ |
| 3 | re-TEST node --check + esbuild JSX | ✅ 4/4 PASS |
| 4 | **Diff exacte montrée à MH + GO explicite (Q1-Q8)** | ✅ "GO V1.12.x.2 — DEPLOY..." |
| 5 | Phase 1 — Backup pré (DB + bookings.js + httpdocs tarball) | ✅ md5 `409349a3` + `209cc3c3` + `a994c9f3` |
| 6 | Phase 2 — SCP backend + PM2 restart + Build Vite + SCP frontend | ✅ PID 952177, bundle `index-BPStrsKS.js` |
| 7 | Phase 3 — Smoke HTTP + tests SQL post-deploy + verif champs JSON | ✅ |
| 8 | Phase 4 — COMMIT (`a9e06eb3`) | ✅ |
| 9 | Phase 4 — PUSH origin/clean-main | ✅ |
| 10 | Phase 4 — TAG `v1.12.x.2-reporting-badge-archive` | ✅ |
| 11 | Phase 5 — Backup post (DB + bookings.js + httpdocs) | ✅ md5 `409349a3` (DB inchangée) + `b804f93b` + `f7f38359` |
| 12 | Phase 6 — HANDOFF doc + memory + PUSH | ✅ ce doc |

---

## 3. Patches détaillés

### A. Backend `bookings.js` — Reporting endpoint enrichi

**Position** : L538-553 (V1.11.4 reporting endpoint, post-V1.12.x.1)

```diff
+    // V1.12.x.2 — expose 3 champs archive du contact pour badge Reporting frontend
     const targetCol = role === 'received' ? 'agendaOwnerId' : 'bookedByCollaboratorId';
     const rows = db.prepare(
-      `SELECT b.* FROM bookings b
+      `SELECT b.*,
+              ct.archivedAt AS contactArchivedAt,
+              ct.archivedBy AS contactArchivedBy,
+              ct.archivedReason AS contactArchivedReason
+       FROM bookings b
        JOIN calendars c ON b.calendarId = c.id
        INNER JOIN contacts ct ON b.contactId = ct.id
        WHERE c.companyId = ?
          AND b.bookingType = 'share_transfer'
          AND b.${targetCol} = ?
          AND b.status = 'confirmed'
        ORDER BY b.date DESC, b.time DESC`
     ).all(companyId, cid);
```

**Effet** : la réponse JSON inclut `contactArchivedAt`, `contactArchivedBy`, `contactArchivedReason` (3 champs minimaux, pas de leak).

### B. Frontend `RdvReportingTab.jsx` — badge archived

**Position** : ~L262 (juste après `<span>{contactName(b)}</span>`)

```diff
     <span style={{ fontSize:14, fontWeight:700, color:T.text }}>{contactName(b)}</span>
+    {/* V1.12.x.2 — badge contact archivé (RDV reste visible pour traçabilité) */}
+    {b.contactArchivedAt && b.contactArchivedAt !== '' && (
+      <span
+        title="Ce contact est archivé mais ce RDV reste visible pour conserver la traçabilité."
+        style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:4, background:'#64748B18', color:'#64748B', display:'inline-flex', alignItems:'center', gap:3, cursor:'help' }}>
+        📦 Contact archivé
+      </span>
+    )}
     {contactPhone(b) && (...)}
```

**Style** : cohérent banner V1.12.8.c (gris dashed `#64748B18`).

### C. Frontend `FicheActionsBar.jsx` — confirmation enrichie

**Modifs** :
1. Ajout `bookings` dans destructure context
2. Bouton Archiver : pré-check côté frontend des RDV confirmés futurs → confirm message contextuel

```js
const _today = new Date().toISOString().split('T')[0];
const _futureBks = (bookings||[]).filter(bk =>
  bk.contactId === ct.id &&
  bk.status === 'confirmed' &&
  (bk.date || '') >= _today
);
const _msg = _futureBks.length > 0
  ? `Archiver "${ct.name}" ?\n\n${_futureBks.length} RDV confirmé(s) lié(s) resteront visibles dans Agenda et Reporting (traçabilité préservée).\n\nLe contact sera masqué du CRM/Pipeline mais récupérable.`
  : `Archiver "${ct.name}" ?\n\nLe contact sera masqué mais récupérable.`;
if (confirm(_msg)) { /* archive flow */ }
```

### D. Frontend `CrmTab.jsx` L1118 — duplicate inline

Symétrique avec FicheActionsBar (CrmTab a déjà `bookings` dans le destructure context).

---

## 4. Décisions Q1-Q8 validées MH

| # | Question | Choix | Effet |
|---|---|---|---|
| Q1 | Position badge | À côté contactName | Badge inline juste après nom |
| Q2 | Style badge | Gris cohérent V1.12.8.c | `#64748B18` / `#64748B` |
| Q3 | Tooltip | Validé | "Ce contact est archivé mais ce RDV reste visible..." |
| Q4 | Pré-check confirmation | Futurs uniquement | RDV passés = historique non actionnable |
| Q5 | Mention share_transfer | Pas spécifique | Message générique RDV (subset OK) |
| Q6 | Backend champs retournés | 3 archive uniquement | Pas de leak, minimal |
| Q7 | Format texte confirm | Multi-lignes \n\n | Cohérent V1.12.8.a |
| Q8 | Tag | Dédié | `v1.12.x.2-reporting-badge-archive` |

---

## 5. Comportement runtime — avant/après

| Scénario | Avant V1.12.x.2 | Après V1.12.x.2 |
|---|---|---|
| Reporting RDV avec contact actif | Ligne normale | **Inchangée** ✅ |
| Reporting RDV avec contact archivé | Ligne sans signal | **Ligne + badge "📦 Contact archivé"** + tooltip |
| Click "Archiver" sur contact sans RDV futur | "Archiver X ?\n\nLe contact sera masqué mais récupérable." | **Inchangé** |
| Click "Archiver" sur contact avec N RDV confirmés futurs | Idem | **"...N RDV confirmé(s) resteront visibles dans Agenda et Reporting (traçabilité préservée). Contact masqué CRM/Pipeline mais récupérable."** |
| Bookings DB | INCHANGÉES | **INCHANGÉES** |
| V1.12.x.1 reporting clean (filter status+JOIN) | Actif | **Actif** (cohabitation) |
| Pipeline / Agenda / CRM | INCHANGÉS | **INCHANGÉS** |
| Onglet Archivés V1.12.8.b | INCHANGÉ | **INCHANGÉ** |

---

## 6. Endpoints impactés

| Endpoint | Changement |
|---|---|
| `GET /api/bookings/reporting?role=received\|sent` | **3 champs ajoutés** : `contactArchivedAt`, `contactArchivedBy`, `contactArchivedReason` |
| Tous autres endpoints | INCHANGÉS |

---

## 7. Tests post-deploy — PASS

| Test | Résultat |
|---|:---:|
| Source prod : `contactArchivedAt` dans bookings.js | ✅ 1 mention |
| Bundle frontend : "Contact archivé" | ✅ 4 mentions (badge + comments) |
| Bundle frontend : "traçabilité préservée" | ✅ 1 mention (confirm) |
| HTTP smoke index/bundle/health | ✅ 200/200/ok uptime 169s |
| SQL : 3 reporting confirmed visible | ✅ |
| SQL : 1 avec contact archivé (badge prévu) | ✅ |
| `PRAGMA integrity_check` | ✅ ok |
| `PRAGMA foreign_key_check` | ✅ 0 violation |
| PM2 status / unstable restarts | ✅ online / 0 |

---

## 8. Backups

| Quoi | Path VPS | md5 |
|---|---|---|
| DB pré | `/var/backups/planora/v112x2-pre/calendar360.db.pre-v112x2` | `409349a3` |
| bookings.js pré | `/var/backups/planora/v112x2-pre/bookings.js.pre-v112x2` | `209cc3c3` |
| httpdocs pré tarball | `/var/backups/planora/v112x2-pre/httpdocs-pre-v112x2.tar.gz` | `a994c9f3` |
| DB post | `/var/backups/planora/v112x2-post/calendar360.db.post-v112x2` | `409349a3` (inchangée) |
| bookings.js post | `/var/backups/planora/v112x2-post/bookings.js.post-v112x2` | `b804f93b` |
| httpdocs post tarball | `/var/backups/planora/v112x2-post/httpdocs-post-v112x2.tar.gz` | `f7f38359` |

**Rollback complet possible** via les 2 tarballs pré.

---

## 9. État Git après V1.12.x.2

```
HEAD : a9e06eb3 (V1.12.x.2 — Reporting badge contact archivé + confirmation archive enrichie)
Tags V1.12 (17) :
  v1.12.1 → v1.12.7 (backend complet)
  v1.12.8a/fixup/b/c (frontend archive UX)
  v1.12.x.1-reporting-clean (audit ghost contacts)
  v1.12.x.2-reporting-badge-archive ← NEW
Branch : clean-main → origin/clean-main aligned
Bundle prod : index-BPStrsKS.js
```

---

## 10. Tests UI fonctionnels MH

| # | Test | Étapes | Attendu | Validation MH |
|---|---|---|---|:---:|
| F1 | Reporting Thomas Reçus | Login Thomas → Reporting RDV → onglet "Reçus" | 0 RDV (cancelled masqués V1.12.x.1) | — |
| F2 | Reporting Thomas Transmis | onglet "Transmis" | 1+ RDV confirmés visibles | — |
| F3 | **Badge archivé visible** | Si un RDV transmis a contact archivé | Badge gris "📦 Contact archivé" à côté du nom | ✅ **Validé visuellement par MH 2026-05-01** |
| F4 | **Tooltip archivé** | Hover sur badge | Tooltip "Ce contact est archivé mais ce RDV reste visible..." | — |
| F5 | Régression contact actif | RDV avec contact actif | Pas de badge, ligne normale | — |
| F6 | **Confirm Archiver simple** | Archiver contact SANS RDV futur | Message "Archiver X ?\n\nLe contact sera masqué mais récupérable." | — |
| F7 | **Confirm Archiver avec RDV** | Archiver contact AVEC N RDV confirmés futurs | Message enrichi mentionne N RDV + Agenda/Reporting + traçabilité | — |
| F8 | Régression Pipeline / Agenda | Vérifier autres surfaces | INCHANGÉES | — |
| F9 | Régression onglet Archivés V1.12.8.b | Onglet Archivés CRM | INCHANGÉ | — |

---

## 10.bis. Sécurisation post-validation 2026-05-01

Post validation visuelle MH du badge "📦 Contact archivé" (F3 PASS), procédure de sécurisation :

| Étape | Résultat |
|---|:---:|
| Git status propre vis-à-vis V1.12.x.2 | ✅ HEAD `3aad1931` = origin/clean-main |
| Tag `v1.12.x.2-reporting-badge-archive` présent | ✅ |
| Healthcheck prod | ✅ status=ok uptime 3423s (57min) |
| PM2 stability | ✅ online / unstable_restarts 0 / restarts 104 |
| Bundle prod servi | ✅ `index-BPStrsKS.js` |
| Backup post-validation DB | ✅ md5 `6e90d278` (drift normal vs pré, activité user) |
| Backup post-validation bookings.js | ✅ md5 `b804f93b` (identique post-deploy = code inchangé hors scope) |
| Backup post-validation httpdocs | ✅ md5 `f7f38359` (identique post-deploy = code inchangé hors scope) |
| Path backup validated | `/var/backups/planora/v112x2-validated/` |

---

## 11. Checklist validation finale

- ✅ Backup pré DB + 4 fichiers + httpdocs
- ✅ SCP backend + PM2 restart + warmup 8s
- ✅ Build Vite OK (2.28s)
- ✅ SCP frontend + cleanup ancien bundle
- ✅ Smoke HTTP 200/200/health ok
- ✅ Smoke SQL : 3 reporting confirmed visible / 1 archivé
- ✅ COMMIT a9e06eb3 (4 files / 19+ / 4-)
- ✅ PUSH origin/clean-main
- ✅ TAG v1.12.x.2-reporting-badge-archive
- ✅ Backup post DB + 4 fichiers + httpdocs
- ✅ Healthcheck final ok / uptime 169s+
- ✅ PM2 unstable_restarts = 0
- ✅ HANDOFF doc + memory entry

---

## 12. Reste V1.12

✅ V1.12.x.1 + V1.12.x.2 audit Reporting complets
- ⏭ V1.12.9 frontend hard delete UI + bouton "Supprimer définitivement" admin (~2h)
- V1.12.10 tests régression (~4h)
- V1.12.11 HANDOFF + tag final `v1.12.0-archive-contacts`

---

## 13. STOP V1.12.x.2 confirmé — Phase 6 close

**Prod stable, feature visible, aucun effet de bord, état entièrement sécurisé et traçable.**

Aucune action sans GO MH explicite. Tests UI manuels MH attendus (F1-F9) avant V1.12.9.
