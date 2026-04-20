# PHASE B — Rapport d'investigation MonBilan bookings sans contact (2026-04-20)

> **Read-only.** Aucune modification effectuée.
> Périmètre : tenant `c-monbilan` uniquement.
> Source : `/var/www/planora-data/tenants/c-monbilan.db` (post Phase A).

---

## 1. TL;DR

| Catégorie | Nb | Verdict |
|---|---|---|
| Bookings totaux MonBilan | 39 | — |
| Avec contact valide | 7 | ✅ OK |
| Avec `contactId` vide / NULL | 2 | 🟡 Booking public propre by-design (pas un orphelin) |
| **Avec `contactId` orphelin (pointe vers contact supprimé)** | **30** | ⚠ **À DÉCIDER** |

**Aucun des 30 orphelins n'est un booking public Calendly-style.** Tous ont `source='pipeline'`, ils
ont été créés depuis le Pipeline Live d'un collab → ils avaient un contactId valide à l'origine.
Le contact a été supprimé ensuite (test/recréation).

**6 des 10 contactIds orphelins ont un équivalent par email** dans les contacts actuels (suppression
+ recréation du même contact avec un nouvel id). Donc on a une vraie possibilité de "remap propre"
pour 19 bookings sur 30.

---

## 2. Distribution des 30 orphelins

### Par source
| source | n |
|---|---|
| `pipeline` | **30** (= 100%) |

→ **Aucun booking public** dans les orphelins. Le scénario "RDV Calendly visiteur sans CRM"
n'existe pas ici. Tous les orphelins viennent du Pipeline Live.

### Par status
| status | n |
|---|---|
| `cancelled` | 27 (90%) |
| `confirmed` | 3 (10%) |

### Par bookingType
| bookingType | n |
|---|---|
| `external` | 30 |

(défaut Phase A pour rows existantes — pas significatif)

### `manageToken` (lien public de gestion généré)
| | n |
|---|---|
| `has manageToken` (lien public partagé) | 23 |
| pas de `manageToken` (interne uniquement) | 7 |

---

## 3. Liste détaillée des 30 orphelins

> Note : la table `bookings` n'a **pas de colonne `createdAt`**. La colonne `date+time`
> représente le jour/heure du **RDV** (pas la création du record). Pour identifier
> l'ordre d'apparition, l'`id` (qui contient un timestamp Unix : `bk<ms>`) est plus fiable.

| # | id | contactId | date | time | status | visitorName | visitorEmail | visitorPhone | mgToken | gcal | collab |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | bk1774969047129 | ct1774891551680 | 2026-04-22 | 15:00 | cancelled | romain sitbon | romain.biotech@gmail.com | 0644686824 | yes | yes | u-jordan |
| 2 | bk1774969529525 | ct1774891551680 | 2026-04-17 | 12:00 | cancelled | romain sitbon | romain.biotech@gmail.com | 0644686824 | yes | yes | u-jordan |
| 3 | bk1775795765152 | ct17757957649807a5g | 2026-04-13 | 13:00 | **confirmed** | Romain Sitbon | _(vide)_ | 0616367116 | yes | yes | u-jordan |
| 4 | bk1775041916391 | ct1774569201336 | 2026-04-13 | 10:00 | **confirmed** | Romain Sitbon | rc.sitbon@gmail.com | +33644686824 | yes | yes | u-guillaume |
| 5 | bk1775562907705 | ct1775553932527 | 2026-04-09 | 11:30 | cancelled | Mme Eva Bronner | juju@gmail.com | 771716776 | yes | yes | u-jordan |
| 6 | bk1775562446885 | ct1775002913105 | 2026-04-08 | 12:00 | cancelled | romaintest roror | Rc@gmail.com | +33644686824 | yes | yes | u-jordan |
| 7 | bk1775468512404 | ct1774907550965 | 2026-04-07 | 10:00 | cancelled | sitbon alain | _(vide)_ | +33611913142 | yes | yes | u-jordan |
| 8 | bk1775468417817 | ct1774891551680 | 2026-04-07 | 10:00 | cancelled | M romain sitbon | romain.biotech@gmail.com | +33644686824 | yes | yes | u-jordan |
| 9 | bk1775332856236 | ct1775002913105 | 2026-04-06 | 10:00 | cancelled | romaintest roror | Rc@gmail.com | +33644686324 | yes | yes | u-jordan |
| 10 | bk1775333060039 | ct1775002913105 | 2026-04-05 | 10:00 | cancelled | romaintest roror | Rc@gmail.com | +33644686824 | yes | yes | u-jordan |
| 11 | bk1775001867812 | ct1774891551680 | 2026-04-02 | 13:00 | cancelled | romain sitbon | romain.biotech@gmail.com | 0644686824 | yes | yes | u-jordan |
| 12 | bk1774719788653 | ct1774569201336 | 2026-04-01 | 14:15 | cancelled | Romain Sitbon | rc.sitbon@gmail.com | +33644686824 | yes | yes | u-guillaume |
| 13 | bk1774970523000 | ct1774891551680 | 2026-04-01 | 14:00 | cancelled | romain sitbon | romain.biotech@gmail.com | 0644686824 | yes | yes | u-jordan |
| 14 | bk1774819397303 | ct1774819397149pw56 | 2026-04-01 | 14:00 | **confirmed** | Romain charles charles | _(vide)_ | 0644686824 | yes | yes | u-guillaume |
| 15 | bk1774892690324 | ct1774891551680 | 2026-03-31 | 16:00 | cancelled | romain sitbon | romain.biotech@gmail.com | 0644686824 | yes | no | u-jordan |
| 16 | bk1774892627033 | ct1774891551680 | 2026-03-31 | 16:00 | cancelled | romain sitbon | romain.biotech@gmail.com | 0644686824 | yes | no | u-jordan |
| 17 | bk1774891721672 | ct1774891551680 | 2026-03-31 | 14:30 | cancelled | romain sitbon | romain.biotech@gmail.com | 0644686824 | yes | no | u-jordan |
| 18 | bk1774890063017 | ct1774872506050_uzue | 2026-03-31 | 11:30 | cancelled | Amelie guillot | Melie.guillot@outlook.fr | 623901415 | yes | no | u-jordan |
| 19 | bk1774889641133 | ct1774872506050_uzue | 2026-03-31 | 11:30 | cancelled | Amelie guillot | Melie.guillot@outlook.fr | 623901415 | yes | no | u-jordan |
| 20 | bk1774889535906 | ct1774872506050_uzue | 2026-03-31 | 11:30 | cancelled | Amelie guillot | Melie.guillot@outlook.fr | 623901415 | yes | no | u-jordan |
| 21 | bk1774891606042 | ct1774891551680 | 2026-03-31 | 11:00 | cancelled | romain sitbon | romain.biotech@gmail.com | 0644686824 | yes | no | u-jordan |
| 22 | bk1774887360086 | ct1774872506053_vss5 | 2026-03-31 | 11:00 | cancelled | Huet | orlanne.huet@icloud.com | 749025487 | no | yes | u-jordan |
| 23 | bk1774891441738 | ct1774872506051_slk5 | 2026-03-31 | 09:00 | cancelled | Marie-ange jamard ze | marieange1978.maz@gmail.com | 754529661 | yes | yes | u-jordan |
| 24 | bk1774571647100 | ct1774569201336 | 2026-03-30 | 17:00 | cancelled | Romain Sitbon | rc.sitbon@gmail.com | +33644686824 | no | no | u-guillaume |
| 25 | bk1774620950725 | ct1774569201336 | 2026-03-30 | 10:00 | cancelled | Romain Sitbon | rc.sitbon@gmail.com | +33644686824 | no | no | u-guillaume |
| 26 | bk1774801814615 | ct1774569201336 | 2026-03-30 | 09:00 | cancelled | Romain Sitbon | rc.sitbon@gmail.com | +33644686824 | yes | no | u-guillaume |
| 27 | bk1774621284184 | ct1774569201336 | 2026-03-28 | 14:30 | cancelled | Romain Sitbon | rc.sitbon@gmail.com | +33644686824 | no | no | u-guillaume |
| 28 | bk1774621301782 | ct1774569201336 | 2026-03-28 | 14:00 | cancelled | Romain Sitbon | rc.sitbon@gmail.com | +33644686824 | no | no | u-guillaume |
| 29 | bk1774571819397 | ct1774569201336 | 2026-03-27 | 18:30 | cancelled | Romain Sitbon | rc.sitbon@gmail.com | +33644686824 | no | no | u-guillaume |
| 30 | bk1774569322393 | ct1774569201336 | 2026-03-27 | 14:00 | cancelled | Romain Sitbon | rc.sitbon@gmail.com | +33644686824 | no | no | u-guillaume |

`companyId` est `c-monbilan` partout, `bookingType` est `external` partout (= défaut Phase A).

---

## 4. Groupement par contactId orphelin (10 distincts)

| # | contactId orphelin | n bookings | visitor (résumé) | email | période | cancelled / confirmed |
|---|---|---|---|---|---|---|
| 1 | `ct1774569201336` | 9 | Romain Sitbon | rc.sitbon@gmail.com | 2026-03-27 → 04-13 | 8 / 1 |
| 2 | `ct1774891551680` | 9 | romain sitbon | romain.biotech@gmail.com | 2026-03-31 → 04-22 | 9 / 0 |
| 3 | `ct1774872506050_uzue` | 3 | Amelie guillot | Melie.guillot@outlook.fr | 2026-03-31 (même jour) | 3 / 0 |
| 4 | `ct1775002913105` | 3 | romaintest roror | Rc@gmail.com | 2026-04-05 → 04-08 | 3 / 0 |
| 5 | `ct1774819397149pw56` | 1 | Romain charles charles | _(vide)_ | 2026-04-01 | 0 / 1 |
| 6 | `ct1774872506051_slk5` | 1 | Marie-ange jamard ze | marieange1978.maz@gmail.com | 2026-03-31 | 1 / 0 |
| 7 | `ct1774872506053_vss5` | 1 | Huet | orlanne.huet@icloud.com | 2026-03-31 | 1 / 0 |
| 8 | `ct1774907550965` | 1 | sitbon alain | _(vide)_ | 2026-04-07 | 1 / 0 |
| 9 | `ct1775553932527` | 1 | Mme Eva Bronner | juju@gmail.com | 2026-04-09 | 1 / 0 |
| 10 | `ct17757957649807a5g` | 1 | Romain Sitbon | _(vide)_ | 2026-04-13 | 0 / 1 |

→ Total : **30 bookings, 10 contactIds distincts**.

---

## 5. Cross-référence avec contacts actuellement en base

> Sanity check : **aucun** des 10 contactIds orphelins n'existe dans la table `contacts`
> de MonBilan (suppression confirmée).
>
> **MAIS** plusieurs `visitorEmail` correspondent à des contacts qui existent encore,
> juste avec un nouvel `id` (= contact recréé après suppression).

| visitorEmail (booking) | contactId orphelin | Contact actuel correspondant (id, name) | Bookings remappable |
|---|---|---|---|
| `Melie.guillot@outlook.fr` | `ct1774872506050_uzue` | `ct_1776145908058_wtaru9` (vide) | 3 |
| `orlanne.huet@icloud.com` | `ct1774872506053_vss5` | `ct_1776145908086_zo67ea` (vide) | 1 |
| `Rc@gmail.com` | `ct1775002913105` | `ct_1776145908236_gmn91t` (vide) | 3 |
| `juju@gmail.com` | `ct1775553932527` | `ct_1776206683167_iwx8p2` (vide) | 1 |
| `rc.sitbon@gmail.com` | `ct1774569201336` | `ct_1776273340046_5oz9u2` (vide) | 9 |
| `marieange1978.maz@gmail.com` | `ct1774872506051_slk5` | `ct_1776289668254_lqufr4` (vide) | 1 |
| **— total remappables —** | — | — | **18** |

Les 4 contactIds orphelins SANS équivalent actuel :
| contactId orphelin | visitorEmail | Bookings à part |
|---|---|---|
| `ct1774891551680` | `romain.biotech@gmail.com` | 9 |
| `ct1774907550965` | _(vide)_ — `sitbon alain` | 1 |
| `ct1774819397149pw56` | _(vide)_ — `Romain charles charles` | 1 |
| `ct17757957649807a5g` | _(vide)_ — `Romain Sitbon` (sur tel `0616367116`) | 1 |
| **— total non-remappables par email —** | — | **12** |

### Inventaire complet des contacts MonBilan actuels (13 lignes, dont placeholder `__deleted__`)
```
id                           name                email
__deleted__                  ''                  ''                              ← placeholder !
ct1774569283665              test                sitbon.immobilier@gmail.com
ct1774817562579              ts                  test1@gmail.com
ct1776201714807_jijr         Françoise Lalieve   lalieve.fr@gmail.com
ct_1776145908058_wtaru9      ''                  Melie.guillot@outlook.fr
ct_1776145908086_zo67ea      ''                  orlanne.huet@icloud.com
ct_1776145908170_n832g1      ''                  test@rbac.com
ct_1776145908196_js562o      ''                  ''
ct_1776145908236_gmn91t      ''                  Rc@gmail.com
ct_1776206683167_iwx8p2      ''                  juju@gmail.com
ct_1776206683184_wc90bl      ''                  ''
ct_1776273340046_5oz9u2      ''                  rc.sitbon@gmail.com
ct_1776289668254_lqufr4      ''                  marieange1978.maz@gmail.com
```

⚠ **Note importante** : le contact `__deleted__` existe déjà dans la table — c'est un
**placeholder pattern**. Si on `UPDATE bookings SET contactId='__deleted__' WHERE ...`,
l'activation future des FK passera (la contrainte est satisfaite), et l'historique du
booking est préservé tout en signalant explicitement "contact retiré".

---

## 6. Lecture humaine

### Profil des données
- **18/30 bookings** sont des RDV de **MH lui-même** (`rc.sitbon@gmail.com`,
  `romain.biotech@gmail.com`, `+33644686824`, `0644686824`, `0616367116`) sur ses propres
  numéros — clairement des **RDV de test** créés et supprimés en interne.
- **5/30 bookings** = `romaintest roror` (`Rc@gmail.com`) — 100% test au nom évocateur.
- **5/30 bookings** = vrais visiteurs (Amelie guillot, Marie-ange jamard, Huet, Eva Bronner,
  sitbon alain) qui ont été supprimés/recréés (4 ont un équivalent par email actuellement).
- **27/30 sont `cancelled`** → bookings annulés puis le contact supprimé après. Cohérent
  avec la dette de tests Pipeline Live.

### Pas un seul booking public Calendly
Le scénario "visiteur public propre, pas censé être en CRM" **n'apparaît pas** dans les
30 orphelins. Tous viennent du Pipeline Live (un collab a cliqué sur un contact pour créer
un RDV). La distinction "public vs orphelin" évoquée dans l'audit initial **se résout
en faveur de "100% orphelins"**, mais d'orphelins essentiellement non-business
(tests + recréations).

### Les 2 bookings avec `contactId = ''` (hors des 30, rappel)
Pour info, séparément des 30 orphelins, il y a 2 bookings avec `contactId=''`.
Ce sont les vrais "publics propres" by-design — non concernés par cette analyse.
À vérifier dans une future Phase si pertinent.

---

## 7. Stratégies possibles (en attente de décision MH — aucune appliquée)

| Stratégie | Description | Bookings concernés | FK-compatible | Perte | Effort |
|---|---|---|---|---|---|
| **A — Statu quo** | Ne rien faire | 30 | ❌ (FK rejettera ces rows) | 0 | 0 |
| **B — Mark-deleted** | `UPDATE bookings SET contactId='__deleted__' WHERE id IN (...)` | 30 | ✅ | historique du contactId d'origine (gardable dans une colonne `originalContactId` si voulu) | 1 query |
| **C — Mark-empty** | `UPDATE bookings SET contactId='' WHERE id IN (...)` | 30 | ⚠ Selon FK : `''` est techniquement une valeur invalide pour FK strict (sauf si on accepte NULL/empty) | idem B | 1 query |
| **D — Remap par email** | `UPDATE bookings SET contactId='<new_id>' WHERE contactId IN (vieux) AND visitorEmail = '<email>'` | 18 (les 6 emails ré-existants) | ✅ | 0 (relinks vers le nouveau contact) | 6 queries précises |
| **E — Mix D + B** | D pour les 18 remappables, B pour les 12 restants | 30 | ✅ | minimale | 7 queries |
| **F — Delete** | `DELETE FROM bookings WHERE id IN (30 ids)` | 30 | ✅ | historique total des RDV | 1 query |

### Recommandation Claude
**Stratégie E (Mix D + B)** :
1. Remap les 18 bookings vers leur nouveau contactId (les 6 emails ré-existants)
2. Pour les 12 restants (sans équivalent email), set `contactId='__deleted__'`
3. Compatible avec activation FK future
4. Préserve 100% de l'historique RDV
5. Préserve la liaison "ce RDV concerne MELIE.GUILLOT actuellement en base"
6. Aucune perte de donnée

**Si tu préfères plus simple** : stratégie B pure (`__deleted__` pour les 30) est une
solution propre, idempotente, FK-safe. Inconvénient : on perd la possibilité de retrouver
"ce RDV était lié à Melie qui existe toujours sous un autre id".

**À ne pas faire** : stratégie F (delete) — perte d'historique sans gain réel. Et statu
quo (A) si on prévoit Phase D/E (FK ON), sinon ce sera bloqué.

---

## 8. Questions à trancher pour Phase B-execute (si décidée)

1. **Stratégie** : A / B / C / D / E / F ?
2. Si E ou D : **garder l'`originalContactId`** dans une nouvelle colonne pour audit historique
   (1 colonne `bookings.originalContactId TEXT DEFAULT ''`) ou pas ?
3. Si B ou E : **OK pour utiliser le placeholder `__deleted__`** déjà présent en base ?
4. **2 bookings avec `contactId=''`** (les "EMPTY") : on les traite aussi ou on les laisse ?
5. **Périmètre** : MonBilan seul (30 rows) ou inclure les 32 du monolithe + 16 ambigus
   en une seule passe Phase C cohérente ?

---

## 9. Garanties tenues (vs contraintes du brief MH)

| Contrainte | Tenue |
|---|---|
| Aucune correction | ✅ |
| Aucune suppression | ✅ |
| Aucune activation FK | ✅ |
| Aucun nettoyage automatique | ✅ |
| Read-only | ✅ (que des SELECT/PRAGMA) |
| Périmètre MonBilan | ✅ |

Aucune action prise. Décision MH attendue avant toute exécution.
